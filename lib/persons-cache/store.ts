import type { SupabaseClient } from '@supabase/supabase-js'
import type { RawProspect } from '@/lib/prospect-search/engine'
import type { ProspectEnrichmentData } from '@/lib/types'

export type EnrichmentLevel = 'raw' | 'standard' | 'dropped'

interface CacheRow {
  canonical_key: string
  siren: string | null
  dirigeant_prenom: string
  dirigeant_nom: string
  dirigeant_qualite: string | null
  dirigeant_annee_naissance: number | null
  code_naf: string | null
  departement: string | null
  ville: string | null
  discovery_sources: string[]
  raw_data: RawProspect
  enrichment_data: (ProspectEnrichmentData & { raison_principale?: string }) | null
  patrimony_score: number | null
  enrichment_level: EnrichmentLevel
  last_enriched_at: string | null
}

export function buildCacheRow(
  raw: RawProspect,
  enrichment: ProspectEnrichmentData | null,
  patrimonyScore: number | null,
  raisonPrincipale: string | null,
  enrichmentLevel?: EnrichmentLevel,
): CacheRow {
  const level: EnrichmentLevel = enrichmentLevel ?? (enrichment ? 'standard' : 'raw')
  return {
    canonical_key: raw.uid,
    siren: raw.siren || null,
    dirigeant_prenom: raw.dirigeant_prenom,
    dirigeant_nom: raw.dirigeant_nom,
    dirigeant_qualite: raw.dirigeant_qualite || null,
    dirigeant_annee_naissance: raw.dirigeant_annee_naissance ?? null,
    code_naf: raw.code_naf || null,
    departement: raw.departement || null,
    ville: raw.ville || null,
    discovery_sources: [raw.source],
    raw_data: raw,
    enrichment_data: enrichment
      ? { ...enrichment, raison_principale: raisonPrincipale ?? undefined }
      : null,
    patrimony_score: patrimonyScore,
    enrichment_level: level,
    last_enriched_at: level !== 'raw' ? new Date().toISOString() : null,
  }
}

export async function storePersonsToCache(
  supabase: SupabaseClient,
  persons: Array<{
    raw: RawProspect
    enrichment: ProspectEnrichmentData | null
    patrimonyScore: number | null
    raisonPrincipale: string | null
    enrichmentLevel?: EnrichmentLevel
  }>,
): Promise<void> {
  if (persons.length === 0) return

  const rows = persons.map(({ raw, enrichment, patrimonyScore, raisonPrincipale, enrichmentLevel }) =>
    buildCacheRow(raw, enrichment, patrimonyScore, raisonPrincipale, enrichmentLevel),
  )

  const { error } = await supabase
    .from('prospection_persons_cache')
    .upsert(rows, {
      onConflict: 'canonical_key',
      ignoreDuplicates: false,
    })

  if (error) {
    console.error('[persons-cache/store] upsert error:', error.message)
  }
}
