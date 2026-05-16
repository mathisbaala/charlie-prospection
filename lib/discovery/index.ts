export { inferDiscoveryParams } from './infer-params'
import { canonicalPersonKey } from '@/lib/prospect-search/engine'
import type { RawProspect } from '@/lib/prospect-search/engine'
import { pappersNafSource } from './pappers-naf'
import { bodaccCessionsSource } from './bodacc-cessions'
import { rppsSource } from './rpps'
import { annuaireEntreprisesSource } from './annuaire-entreprises'
import { inpiRneSource } from './inpi-rne'
import { rneElusSource } from './rne-elus'
import { sireneCreationsSource } from './sirene-creations'
import type { DiscoveryParams, DiscoverySource } from './types'

export type DiscoverySourceName =
  | 'pappers-naf'
  | 'bodacc-cessions'
  | 'rpps'
  | 'annuaire-entreprises'
  | 'inpi-rne'
  | 'rne-elus'
  | 'sirene-creations'

const SOURCE_MAP: Record<DiscoverySourceName, DiscoverySource> = {
  'pappers-naf': pappersNafSource,
  'bodacc-cessions': bodaccCessionsSource,
  rpps: rppsSource,
  'annuaire-entreprises': annuaireEntreprisesSource,
  'inpi-rne': inpiRneSource,
  'rne-elus': rneElusSource,
  'sirene-creations': sireneCreationsSource,
}

const TOTAL_CAP = 50

export type RunDiscoveryParams = DiscoveryParams

/**
 * Infer which discovery sources to activate from the search params.
 *
 * ── Sources actives selon la cible ─────────────────────────────────────────
 *
 * BODACC cessions    → toujours — cession récente = liquidité imminente
 * RPPS               → dept connu OU profession santé inférée (national)
 *                      Mode national : médecins + dentistes + pharmaciens seulement
 *                      (les 3 professions ★★★★★ en valeur patrimoniale CGP)
 * Sirene créations   → toujours — professions libérales nouvellement immatriculées
 *                      Couvre les BNC absents de BODACC (RCS-only) et INPI RNE.
 *                      Filtre : NAF du persona si dispo, sinon professions libérales HV.
 *                      Source : prospection_signals_inbox (cron quotidien sirene-ingest).
 * Pappers NAF        → NAF inféré des roles/secteurs du persona (payant, ciblé)
 * Annuaire Entrep.   → NAF inféré (gratuit, couvre micro/artisans absents de Pappers)
 * INPI RNE           → toujours — signal patrimonial actif (modif capital, BE, actes)
 * RNE Élus           → toujours — maires/présidents, indemnités + réseau foncier
 *
 * ── Annuaires professionnels : stratégie par type ──────────────────────────
 *
 * SANTÉ (RPPS) : open data, structuré, filtrable → source discovery dédiée ci-dessus.
 *   Médecins libéraux, dentistes, pharmaciens, kinés, sages-femmes.
 *
 * JURIDIQUE / LIBÉRAUX NON-SANTÉ : pas d'API ouverte bulk → couverture via NAF.
 *   Avocats       → NAF 69.10Z (searchEntreprises Pappers + AE)
 *   Notaires      → NAF 69.10Z (idem — enrichissement : URL notaires.fr)
 *   Experts-cptes → NAF 69.20Z (idem — enrichissement : URL experts-comptables.org)
 *   Architectes   → NAF 71.11Z (idem — enrichissement : URL architectes.fr)
 *   Vétérinaires  → NAF 75.00Z (idem — enrichissement : URL ordre-veterinaires.fr)
 *   Géomètres     → NAF 71.12B
 *   Ces NAF sont inférés automatiquement depuis les roles/secteurs du persona
 *   → activent pappers-naf + annuaire-entreprises ci-dessus.
 *
 * DIRIGEANTS / FONDATEURS (sans profession spécifique) :
 *   Couverts par BODACC (cessions), INPI RNE (actes), RNE Élus (mandats),
 *   et searchProspects() (Pappers + AE généralistes) dans route.ts.
 */
function inferSources(params: RunDiscoveryParams): DiscoverySourceName[] {
  const sources: DiscoverySourceName[] = ['bodacc-cessions']
  // RPPS : avec dept = ciblé local. Avec profession = national (médecins/dentistes/pharmaciens)
  if (params.departement || params.profession) sources.push('rpps')
  // Sirene créations : toujours — couvre les BNC libéraux absents de BODACC/INPI RNE.
  // La source filtre par NAF du persona si dispo, sinon professions libérales HV par défaut.
  // Dégrade gracieusement à [] si le cron sirene-ingest n'a pas encore tourné.
  sources.push('sirene-creations')
  if (params.naf_codes?.length || params.naf_code) {
    sources.push('pappers-naf')
    sources.push('annuaire-entreprises')
  }
  sources.push('inpi-rne')
  sources.push('rne-elus')
  return sources
}

export async function runDiscovery(params: RunDiscoveryParams): Promise<RawProspect[]> {
  const sources = inferSources(params)
  if (!sources.length) return []

  const tasks = sources.map((name) =>
    SOURCE_MAP[name].discover({ ...params, limit: params.limit ?? 20 }),
  )

  const settled = await Promise.allSettled(tasks)

  const seen = new Set<string>()
  const merged: RawProspect[] = []

  for (const result of settled) {
    if (result.status === 'rejected') continue
    for (const prospect of result.value) {
      if (merged.length >= TOTAL_CAP) break
      const key = canonicalPersonKey(
        prospect.dirigeant_prenom,
        prospect.dirigeant_nom,
        prospect.siren,
      )
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(prospect)
    }
  }

  return merged
}
