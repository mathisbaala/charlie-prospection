import { timedFetch } from '@/lib/observability/logger'
import {
  extractSirenFromRegistre,
  classifyBodaccEvent,
  type BodaccRecord,
} from '@/lib/data-sources/bodacc'
import {
  getEntrepriseBySiren,
  type AEResult,
  type AEDirigeant,
} from '@/lib/data-sources/annuaire-entreprises'
import { canonicalPersonKey, deptFromCodePostal } from '@/lib/prospect-search/engine'
import type { DiscoverySource, DiscoveryParams } from './types'
import type { RawProspect } from '@/lib/prospect-search/engine'

// BODACC cessions récentes — signal patrimonial fort : dirigeant qui vend son
// entreprise = liquidité imminente, interlocuteur CGP naturel.
// Résolution SIREN via Annuaire Entreprises (gratuit) — PAS Pappers.

const BODACC_BASE =
  'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records'

const DEFAULT_LIMIT = 20

async function fetchRecentAnnouncements(
  dateSince: string,
  departement?: string,
  limit = 60,
): Promise<BodaccRecord[]> {
  let where = `dateparution >= date'${dateSince}'`
  if (departement) {
    where += ` AND numerodepartement:"${departement}"`
  }
  const url = `${BODACC_BASE}?where=${encodeURIComponent(where)}&limit=${limit}&order_by=dateparution%20desc`

  try {
    const res = await timedFetch('bodacc', 'fetchCessionsDiscovery', url, {
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = (await res.json()) as { results?: BodaccRecord[] }
    return data.results ?? []
  } catch {
    return []
  }
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
    source: 'bodacc_cessions',
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
    // Cession récente = signal fort — patrimony_score affinera après enrichissement
    score_initial: 40,
  }
}

export const bodaccCessionsSource: DiscoverySource = {
  name: 'bodacc-cessions',

  async discover(params: DiscoveryParams): Promise<RawProspect[]> {
    const limit = params.limit ?? DEFAULT_LIMIT

    const dateSince =
      params.date_depuis ??
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const records = await fetchRecentAnnouncements(dateSince, params.departement, limit * 3)
    const cessions = records.filter((r) => classifyBodaccEvent(r) === 'cession')

    const seen = new Set<string>()
    const results: RawProspect[] = []

    const settled = await Promise.allSettled(
      cessions.slice(0, limit * 2).map(async (record) => {
        const siren = extractSirenFromRegistre(record.registre)
        if (!siren) return null

        const ae = await getEntrepriseBySiren(siren)
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
