import type { SupabaseClient } from '@supabase/supabase-js'
import type { RawProspect } from '@/lib/prospect-search/engine'
import type { SearchCandidate, ProspectEnrichmentData } from '@/lib/types'
import { ENRICHMENT_STALE_DAYS } from './constants'

export interface CacheFilters {
  nafCodes: string[] | null
  departements: string[] | null
}

export interface CacheHit {
  uid: string
  raw: RawProspect
  enrichment_data: ProspectEnrichmentData
  patrimony_score: number
  niveau: SearchCandidate['niveau']
  raison_principale: string
  needsEnrichment: boolean
}

export function buildCacheFilters(
  nafCodes: string[],
  departements: string[]
): CacheFilters {
  return {
    nafCodes: nafCodes.length > 0 ? nafCodes : null,
    departements: departements.length > 0 ? departements : null,
  }
}

export function cacheRowToPartialCandidate(row: {
  canonical_key: string
  raw_data: unknown
  enrichment_data: unknown
  patrimony_score: number | null
  enrichment_level: string
  last_enriched_at: string | null
}): CacheHit {
  const staleThreshold = new Date()
  staleThreshold.setDate(staleThreshold.getDate() - ENRICHMENT_STALE_DAYS)

  const isStale =
    row.last_enriched_at !== null &&
    new Date(row.last_enriched_at) < staleThreshold

  const needsEnrichment =
    row.enrichment_level === 'raw' ||
    row.enrichment_data === null ||
    isStale

  const score = row.patrimony_score ?? 0

  return {
    uid: row.canonical_key,
    raw: row.raw_data as RawProspect,
    enrichment_data: (row.enrichment_data ?? {}) as ProspectEnrichmentData,
    patrimony_score: score,
    niveau: scoreToNiveau(score),
    raison_principale:
      ((row.enrichment_data as Record<string, unknown>)?.raison_principale as string) ?? '',
    needsEnrichment,
  }
}

function scoreToNiveau(score: number): SearchCandidate['niveau'] {
  if (score >= 75) return 'prioritaire'
  if (score >= 50) return 'fort'
  if (score >= 25) return 'moyen'
  return 'faible'
}

export async function queryPersonsCache(
  supabase: SupabaseClient,
  filters: CacheFilters,
  limit: number
): Promise<CacheHit[]> {
  let query = supabase
    .from('prospection_persons_cache')
    .select('canonical_key, raw_data, enrichment_data, patrimony_score, enrichment_level, last_enriched_at')
    .order('patrimony_score', { ascending: false, nullsFirst: false })
    .limit(limit * 2)

  if (filters.nafCodes) {
    query = query.in('code_naf', filters.nafCodes)
  }
  if (filters.departements) {
    query = query.in('departement', filters.departements)
  }

  const { data, error } = await query
  if (error || !data) return []

  return data.slice(0, limit).map(cacheRowToPartialCandidate)
}
