import { describe, it, expect } from 'vitest'
import { deriveName, unionDedup, mergeCriteria, normaliseProspectCount } from '../helpers'
import type { ParsedIcpCriteria } from '@/lib/types'

const EMPTY: ParsedIcpCriteria = {
  roles: [],
  sectors: [],
  locations: [],
  keywords: [],
  signal_priorities: [],
}

describe('deriveName', () => {
  it('truncates to 60 chars and trims', () => {
    expect(deriveName('   Avocats d\'affaires Paris   ')).toBe(
      "Avocats d'affaires Paris",
    )
  })

  it('falls back to "Persona principale" when empty', () => {
    expect(deriveName('')).toBe('Persona principale')
    expect(deriveName('   ')).toBe('Persona principale')
  })

  it('clips at 60 characters without breaking mid-byte', () => {
    const long = 'A'.repeat(120)
    const name = deriveName(long)
    expect(name.length).toBe(60)
  })

  it('keeps the original first chunk when input is exactly 60 chars', () => {
    const exact = 'A'.repeat(60)
    expect(deriveName(exact)).toBe(exact)
  })
})

describe('unionDedup', () => {
  it('returns empty for two empty arrays', () => {
    expect(unionDedup([], [])).toEqual([])
    expect(unionDedup(undefined, undefined)).toEqual([])
  })

  it('preserves order of first array, then appends new items from second', () => {
    expect(unionDedup(['Médecin', 'Avocat'], ['Notaire', 'Avocat'])).toEqual([
      'Médecin',
      'Avocat',
      'Notaire',
    ])
  })

  it('is case-insensitive (deduplicates AVOCAT vs Avocat)', () => {
    expect(unionDedup(['Avocat'], ['AVOCAT'])).toEqual(['Avocat'])
  })

  it('trims whitespace before dedup', () => {
    expect(unionDedup(['  Médecin  '], ['Médecin'])).toEqual(['Médecin'])
  })

  it('drops empty strings', () => {
    expect(unionDedup(['', 'A', '   '], ['B'])).toEqual(['A', 'B'])
  })
})

describe('mergeCriteria — UX rule: reparse must preserve manual edits', () => {
  it('unions roles, sectors, locations, keywords, signal_priorities', () => {
    const current: ParsedIcpCriteria = {
      ...EMPTY,
      roles: ['Médecin', 'Notaire'],
      sectors: ['Santé'],
      locations: ['Paris'],
      keywords: ['libéral'],
      signal_priorities: ['installation_cabinet'],
    }
    const fresh: ParsedIcpCriteria = {
      ...EMPTY,
      roles: ['Médecin généraliste'],
      sectors: ['Santé', 'Médecine'],
      locations: ['Île-de-France'],
      keywords: ['cabinet'],
      signal_priorities: ['nouveau_poste'],
    }
    const merged = mergeCriteria(current, fresh)
    expect(merged.roles).toEqual(['Médecin', 'Notaire', 'Médecin généraliste'])
    expect(merged.sectors).toEqual(['Santé', 'Médecine'])
    expect(merged.locations).toEqual(['Paris', 'Île-de-France'])
    expect(merged.keywords).toEqual(['libéral', 'cabinet'])
    expect(merged.signal_priorities).toEqual(['installation_cabinet', 'nouveau_poste'])
  })

  it('prefers fresh value on scalars when defined', () => {
    const current: ParsedIcpCriteria = {
      ...EMPTY,
      ca_min: 1_000_000,
      effectif_min: 5,
      age_max: 55,
      target_type: 'personne_morale',
      patrimony_level: 'standard',
      geo_strict: false,
    }
    const fresh: ParsedIcpCriteria = {
      ...EMPTY,
      ca_min: 5_000_000,
      effectif_min: 20,
      age_max: 65,
      target_type: 'both',
      patrimony_level: 'high',
      geo_strict: true,
    }
    const merged = mergeCriteria(current, fresh)
    expect(merged.ca_min).toBe(5_000_000)
    expect(merged.effectif_min).toBe(20)
    expect(merged.age_max).toBe(65)
    expect(merged.target_type).toBe('both')
    expect(merged.patrimony_level).toBe('high')
    expect(merged.geo_strict).toBe(true)
  })

  it('falls back to current when fresh leaves a scalar undefined', () => {
    const current: ParsedIcpCriteria = {
      ...EMPTY,
      ca_min: 1_000_000,
      target_type: 'personne_morale',
    }
    const fresh: ParsedIcpCriteria = { ...EMPTY }
    const merged = mergeCriteria(current, fresh)
    expect(merged.ca_min).toBe(1_000_000)
    expect(merged.target_type).toBe('personne_morale')
  })

  it('handles empty current + empty fresh', () => {
    const merged = mergeCriteria(EMPTY, EMPTY)
    expect(merged.roles).toEqual([])
    expect(merged.target_type).toBeUndefined()
    expect(merged.ca_min).toBeUndefined()
  })
})

describe('normaliseProspectCount — PostgREST aggregate shapes', () => {
  it('extracts count from [{count: N}] relation form', () => {
    expect(normaliseProspectCount([{ count: 12 }])).toBe(12)
  })

  it('returns 0 for empty array', () => {
    expect(normaliseProspectCount([])).toBe(0)
  })

  it('passes through plain numbers', () => {
    expect(normaliseProspectCount(7)).toBe(7)
    expect(normaliseProspectCount(0)).toBe(0)
  })

  it('returns 0 for undefined / null / unexpected shape', () => {
    expect(normaliseProspectCount(undefined)).toBe(0)
    expect(normaliseProspectCount(null)).toBe(0)
    expect(normaliseProspectCount('string')).toBe(0)
    expect(normaliseProspectCount({ count: 5 })).toBe(0)
  })

  it('handles [{count: undefined}] gracefully', () => {
    expect(normaliseProspectCount([{}])).toBe(0)
  })
})
