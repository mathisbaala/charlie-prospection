import { describe, it, expect } from 'vitest'
import { parseDiscoveryParams } from '../run/parse-params'

describe('parseDiscoveryParams', () => {
  it('returns empty params when body is empty', () => {
    const result = parseDiscoveryParams({})
    expect(result.departement).toBeUndefined()
    expect(result.naf_code).toBeUndefined()
  })

  it('extracts departement and naf_code', () => {
    const result = parseDiscoveryParams({
      naf_code: '86.21Z',
      departement: '69',
      ca_min: 500_000,
    })
    expect(result.naf_code).toBe('86.21Z')
    expect(result.departement).toBe('69')
    expect(result.ca_min).toBe(500_000)
  })

  it('extracts rpps_profession', () => {
    const result = parseDiscoveryParams({ rpps_profession: 'Chirurgien-Dentiste' })
    expect(result.profession).toBe('Chirurgien-Dentiste')
  })

  it('ca_min is parsed as a number', () => {
    const result = parseDiscoveryParams({ ca_min: 0 })
    expect(result.ca_min).toBe(0)
  })

  it('non-number ca_min is ignored', () => {
    const result = parseDiscoveryParams({ ca_min: 'not-a-number' })
    expect(result.ca_min).toBeUndefined()
  })
})
