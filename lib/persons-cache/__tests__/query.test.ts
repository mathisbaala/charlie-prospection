import { describe, it, expect } from 'vitest'
import { buildCacheFilters, cacheRowToPartialCandidate } from '../query'

describe('buildCacheFilters', () => {
  it('renvoie naf et depts quand les deux sont fournis', () => {
    const f = buildCacheFilters(['86.21Z', '86.22Z'], ['69', '01', '38'])
    expect(f.nafCodes).toEqual(['86.21Z', '86.22Z'])
    expect(f.departements).toEqual(['69', '01', '38'])
  })

  it('nafCodes null quand tableau vide', () => {
    const f = buildCacheFilters([], ['69'])
    expect(f.nafCodes).toBeNull()
    expect(f.departements).toEqual(['69'])
  })

  it('departements null quand tableau vide', () => {
    const f = buildCacheFilters(['86.21Z'], [])
    expect(f.departements).toBeNull()
  })

  it('les deux null quand tableaux vides', () => {
    const f = buildCacheFilters([], [])
    expect(f.nafCodes).toBeNull()
    expect(f.departements).toBeNull()
  })
})

describe('cacheRowToPartialCandidate', () => {
  const row = {
    canonical_key: 'jean|dupont|123456789',
    raw_data: {
      uid: 'jean|dupont|123456789',
      source: 'pappers',
      source_type: 'personne_morale',
      siren: '123456789',
      code_naf: '86.21Z',
      dirigeant_nom: 'Dupont',
      dirigeant_prenom: 'Jean',
      linkedin_search_url: 'https://linkedin.com',
      score_initial: 50,
    },
    enrichment_data: { siren: '123456789' },
    patrimony_score: 70,
    enrichment_level: 'standard',
    last_enriched_at: new Date(Date.now() - 10 * 86400 * 1000).toISOString(),
  }

  it('mappe correctement un hit fresh', () => {
    const hit = cacheRowToPartialCandidate(row as any)
    expect(hit.uid).toBe('jean|dupont|123456789')
    expect(hit.patrimony_score).toBe(70)
    expect(hit.needsEnrichment).toBe(false)
  })

  it('détecte un hit stale', () => {
    const staleRow = {
      ...row,
      last_enriched_at: new Date(Date.now() - 90 * 86400 * 1000).toISOString(),
    }
    const hit = cacheRowToPartialCandidate(staleRow as any)
    expect(hit.needsEnrichment).toBe(true)
    expect(hit.isDropped).toBe(false)
  })

  it('dropped : isDropped=true, needsEnrichment=false', () => {
    const droppedRow = {
      ...row,
      enrichment_level: 'dropped',
      enrichment_data: null,
      patrimony_score: null,
      last_enriched_at: new Date().toISOString(),
    }
    const hit = cacheRowToPartialCandidate(droppedRow as any)
    expect(hit.isDropped).toBe(true)
    expect(hit.needsEnrichment).toBe(false)
    expect(hit.patrimony_score).toBe(0)
  })
})
