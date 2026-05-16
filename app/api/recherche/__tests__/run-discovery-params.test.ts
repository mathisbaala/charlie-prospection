import { describe, it, expect } from 'vitest'
import { parseDiscoveryParams } from '../run/parse-params'

describe('parseDiscoveryParams', () => {
  it('returns empty sources when no sources in body', () => {
    const result = parseDiscoveryParams({})
    expect(result.sources).toEqual([])
  })

  it('extracts known sources', () => {
    const result = parseDiscoveryParams({
      sources: ['pappers-naf', 'bodacc-cessions'],
      naf_code: '86.21Z',
      departement: '69',
      ca_min: 500_000,
    })
    expect(result.sources).toEqual(['pappers-naf', 'bodacc-cessions'])
    expect(result.naf_code).toBe('86.21Z')
    expect(result.departement).toBe('69')
    expect(result.ca_min).toBe(500_000)
  })

  it('filters out unknown source names', () => {
    const result = parseDiscoveryParams({
      sources: ['pappers-naf', 'unknown-source', 'bodacc-cessions'],
    })
    expect(result.sources).not.toContain('unknown-source')
    expect(result.sources).toContain('pappers-naf')
    expect(result.sources).toContain('bodacc-cessions')
  })

  it('extracts rpps_profession', () => {
    const result = parseDiscoveryParams({ sources: ['rpps'], rpps_profession: 'Chirurgien-Dentiste' })
    expect(result.profession).toBe('Chirurgien-Dentiste')
  })
})
