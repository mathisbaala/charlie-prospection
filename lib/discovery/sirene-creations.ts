import { createClient } from '@/lib/supabase/server'
import {
  getEntrepriseBySiren,
  type AEResult,
  type AEDirigeant,
} from '@/lib/data-sources/annuaire-entreprises'
import { canonicalPersonKey, deptFromCodePostal } from '@/lib/prospect-search/engine'
import type { DiscoverySource, DiscoveryParams } from './types'
import type { RawProspect } from '@/lib/prospect-search/engine'

// Sirene creations — professions libérales nouvellement immatriculées.
//
// Données : prospection_signals_inbox (source='sirene', type_event='creation')
// alimentée par le cron quotidien /api/cron/sirene-ingest.
//
// Valeur ajoutée : couvre les BNC libéraux (médecins, dentistes, avocats)
// qui s'installent comme personnes physiques → absents de BODACC (RCS-only)
// et d'INPI RNE. Signal fort : installation = début de patrimoine professionnel.
//
// Score initial : 30 (création récente = prospect tôt dans le cycle, pas encore
// de liquidité mais fort potentiel long terme pour un CGP).

const DEFAULT_LIMIT = 20
const LOOKBACK_DAYS = 90

// Codes NAF normalisés (sans point, majuscule) — professions libérales haute valeur CGP
const HIGH_VALUE_NAF_CODES = [
  '8621Z', // Médecine générale
  '8622A', '8622B', '8622C', '8622D', // Médecine spécialisée
  '8623Z', // Chirurgie dentaire
  '8690A', '8690B', '8690C', '8690D', '8690E', '8690F', // Autres professions de santé
  '6910Z', // Activités juridiques (avocats, notaires)
  '6920Z', // Activités comptables (experts-comptables)
  '7111Z', // Activités d'architecture
  '7112A', '7112B', // Ingénierie, géomètres
  '7500Z', // Activités vétérinaires
  '7022Z', // Conseil pour les affaires et la gestion
  '4773Z', // Commerce de détail de produits pharmaceutiques (pharmacies)
]

function normaliseNaf(naf: string): string {
  return naf.replace('.', '').toUpperCase().trim()
}

function firstDirigeant(ae: AEResult): AEDirigeant | null {
  for (const d of ae.dirigeants ?? []) {
    if (!d.nom) continue
    const upper = d.nom.toUpperCase()
    if (upper.includes('SARL') || upper.includes('SAS') || upper.includes('SCI')) continue
    return d
  }
  return null
}

function toRawProspect(ae: AEResult, d: AEDirigeant): RawProspect {
  const prenom = d.prenoms?.split(/[\s,]+/)[0]?.trim() ?? ''
  const nom = d.nom?.trim() ?? ''
  const dept = ae.siege.departement ?? deptFromCodePostal(ae.siege.code_postal)
  const q = encodeURIComponent(`${prenom} ${nom} ${ae.nom_complet}`)
  return {
    uid: canonicalPersonKey(prenom, nom, ae.siren),
    source: 'sirene_creations',
    source_type: 'personne_morale',
    entreprise_nom: ae.nom_complet,
    siren: ae.siren,
    code_naf: ae.activite_principale ?? '',
    libelle_naf: ae.libelle_activite_principale ?? '',
    date_creation: ae.date_creation ?? '',
    tranche_effectifs: ae.tranche_effectif_salarie ?? '',
    adresse: ae.siege.adresse ?? '',
    code_postal: ae.siege.code_postal ?? '',
    ville: ae.siege.libelle_commune ?? ae.siege.commune ?? '',
    departement: dept,
    dirigeant_nom: nom,
    dirigeant_prenom: prenom,
    dirigeant_qualite: d.qualite,
    linkedin_search_url: `https://www.linkedin.com/search/results/people/?keywords=${q}`,
    // Création récente = professionnel libéral qui s'installe → potentiel long terme
    score_initial: 30,
  }
}

export const sireneCreationsSource: DiscoverySource = {
  name: 'sirene-creations',

  async discover(params: DiscoveryParams): Promise<RawProspect[]> {
    const limit = params.limit ?? DEFAULT_LIMIT

    const dateSince =
      params.date_depuis ??
      new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    // Codes NAF à filtrer : ceux du persona si disponibles, sinon liste par défaut
    const nafFilter =
      params.naf_codes && params.naf_codes.length > 0
        ? params.naf_codes.map(normaliseNaf)
        : params.naf_code
          ? [normaliseNaf(params.naf_code)]
          : HIGH_VALUE_NAF_CODES

    const supabase = await createClient()

    let query = supabase
      .from('prospection_signals_inbox')
      .select('siren, code_naf, entreprise_nom, departement, date_event')
      .eq('source', 'sirene')
      .eq('type_event', 'creation')
      .gte('date_event', dateSince)
      .in('code_naf', nafFilter)
      .order('date_event', { ascending: false })

    if (params.departement) {
      query = query.eq('departement', params.departement)
    }

    const { data: rows, error } = await query.limit(limit * 3)

    if (error || !rows?.length) return []

    const seen = new Set<string>()
    const results: RawProspect[] = []

    const settled = await Promise.allSettled(
      rows.slice(0, limit * 2).map(async (row) => {
        if (!row.siren) return null
        const ae = await getEntrepriseBySiren(row.siren)
        if (!ae) return null
        const d = firstDirigeant(ae)
        if (!d || !d.nom) return null
        return toRawProspect(ae, d)
      }),
    )

    for (const r of settled) {
      if (results.length >= limit) break
      if (r.status === 'rejected' || !r.value) continue
      const prospect = r.value
      if (seen.has(prospect.uid)) continue
      seen.add(prospect.uid)
      results.push(prospect)
    }

    return results
  },
}
