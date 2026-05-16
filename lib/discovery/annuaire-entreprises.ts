import {
  searchEntreprises,
  type AEResult,
  type AEDirigeant,
} from '@/lib/data-sources/annuaire-entreprises'
import { canonicalPersonKey, deptFromCodePostal } from '@/lib/prospect-search/engine'
import type { DiscoverySource, DiscoveryParams } from './types'
import type { RawProspect } from '@/lib/prospect-search/engine'

// Covers micro-enterprises, artisans, and liberal professions absent from Pappers.
// Zero quota cost — free government API with no rate limit.

const DEFAULT_LIMIT = 20

function buildLinkedInUrl(prenom: string, nom: string, entreprise: string): string {
  const q = encodeURIComponent(`${prenom} ${nom} ${entreprise}`)
  return `https://www.linkedin.com/search/results/people/?keywords=${q}`
}

function anneeNaissance(d: AEDirigeant): number | undefined {
  if (d.annee_de_naissance) return parseInt(d.annee_de_naissance, 10)
  if (d.date_naissance_timestamp_utc) {
    return new Date(d.date_naissance_timestamp_utc).getFullYear()
  }
  return undefined
}

function toRawProspect(ae: AEResult, d: AEDirigeant): RawProspect {
  // AE returns prenoms as space/comma-separated list — take only the first
  const prenom = d.prenoms?.split(/[\s,]+/)[0]?.trim() ?? ''
  const nom = d.nom?.trim() ?? ''
  return {
    uid: canonicalPersonKey(prenom, nom, ae.siren),
    source: 'annuaire_entreprises',
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
    departement: ae.siege.departement ?? deptFromCodePostal(ae.siege.code_postal),
    dirigeant_nom: nom,
    dirigeant_prenom: prenom,
    dirigeant_qualite: d.qualite,
    dirigeant_annee_naissance: anneeNaissance(d),
    linkedin_search_url: buildLinkedInUrl(prenom, nom, ae.nom_complet),
    score_initial: 20, // baseline sector match — patrimony_score affinera
  }
}

function firstPhysicalDirigeant(ae: AEResult): AEDirigeant | null {
  for (const d of ae.dirigeants ?? []) {
    if (!d.nom) continue
    // Skip rows that look like legal entities (all caps long names with SARL/SAS/etc.)
    const upper = d.nom.toUpperCase()
    if (upper.includes('SARL') || upper.includes('SAS') || upper.includes('SCI')) continue
    return d
  }
  return null
}

async function fetchByNaf(
  naf: string,
  dept: string | undefined,
  limit: number,
): Promise<RawProspect[]> {
  try {
    const { results } = await searchEntreprises({
      activite_principale: naf,
      departement: dept,
      per_page: Math.min(limit + 10, 50),
    })
    const prospects: RawProspect[] = []
    for (const ae of results) {
      if (prospects.length >= limit) break
      const d = firstPhysicalDirigeant(ae)
      if (!d) continue
      prospects.push(toRawProspect(ae, d))
    }
    return prospects
  } catch {
    return []
  }
}

export const annuaireEntreprisesSource: DiscoverySource = {
  name: 'annuaire-entreprises',

  async discover(params: DiscoveryParams): Promise<RawProspect[]> {
    const codes = params.naf_codes?.length
      ? params.naf_codes
      : params.naf_code
        ? [params.naf_code]
        : []

    const limit = params.limit ?? DEFAULT_LIMIT

    // With NAF codes: search by sector (targeted)
    if (codes.length > 0) {
      const perNaf = Math.max(5, Math.ceil(limit / codes.length))
      const settled = await Promise.allSettled(
        codes.map((naf) => fetchByNaf(naf, params.departement, perNaf)),
      )
      const seen = new Set<string>()
      const results: RawProspect[] = []
      for (const r of settled) {
        if (results.length >= limit) break
        if (r.status === 'rejected') continue
        for (const prospect of r.value) {
          if (results.length >= limit) break
          if (seen.has(prospect.uid)) continue
          seen.add(prospect.uid)
          results.push(prospect)
        }
      }
      return results
    }

    // Without NAF codes: dept-scoped broad search (lower precision, still useful)
    if (!params.departement) return []
    try {
      const { results } = await searchEntreprises({
        departement: params.departement,
        per_page: Math.min(limit, 25),
      })
      const seen = new Set<string>()
      const prospects: RawProspect[] = []
      for (const ae of results) {
        if (prospects.length >= limit) break
        const d = firstPhysicalDirigeant(ae)
        if (!d) continue
        const p = toRawProspect(ae, d)
        if (seen.has(p.uid)) continue
        seen.add(p.uid)
        prospects.push(p)
      }
      return prospects
    } catch {
      return []
    }
  },
}
