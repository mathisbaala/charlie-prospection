import { canonicalPersonKey } from '@/lib/prospect-search/engine'
import type { RawProspect } from '@/lib/prospect-search/engine'
import { pappersNafSource } from './pappers-naf'
import { bodaccCessionsSource } from './bodacc-cessions'
import { rppsSource } from './rpps'
import type { DiscoveryParams, DiscoverySource } from './types'

export type DiscoverySourceName = 'pappers-naf' | 'bodacc-cessions' | 'rpps'

const SOURCE_MAP: Record<DiscoverySourceName, DiscoverySource> = {
  'pappers-naf': pappersNafSource,
  'bodacc-cessions': bodaccCessionsSource,
  rpps: rppsSource,
}

const TOTAL_CAP = 50

export type RunDiscoveryParams = DiscoveryParams

/**
 * Infer which discovery sources to activate from the search params.
 * No explicit source list needed — presence of params determines relevance.
 *
 * Rules:
 * - departement set  → rpps + bodacc-cessions always active (geo-scoped sources)
 * - naf_code set     → pappers-naf active (explicit sector filter)
 */
function inferSources(params: RunDiscoveryParams): DiscoverySourceName[] {
  const sources: DiscoverySourceName[] = []
  if (params.departement) {
    sources.push('rpps', 'bodacc-cessions')
  }
  if (params.naf_code) {
    sources.push('pappers-naf')
  }
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
