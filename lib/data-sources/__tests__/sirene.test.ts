import { describe, it, expect } from 'vitest'
import { extractDepartementFromCpFR, normaliseSireneNaf, resolveSireneName } from '../sirene'

describe('normaliseSireneNaf', () => {
  it('strips dots and uppercases', () => {
    expect(normaliseSireneNaf('86.21Z')).toBe('8621Z')
    expect(normaliseSireneNaf('69.20z')).toBe('6920Z')
  })

  it('handles missing input', () => {
    expect(normaliseSireneNaf(null)).toBe(null)
    expect(normaliseSireneNaf(undefined)).toBe(null)
    expect(normaliseSireneNaf('')).toBe(null)
  })

  it('leaves an already-clean code untouched', () => {
    expect(normaliseSireneNaf('8621Z')).toBe('8621Z')
  })
})

describe('extractDepartementFromCpFR', () => {
  it('extracts 2-digit dept on mainland', () => {
    expect(extractDepartementFromCpFR('75001')).toBe('75')
    expect(extractDepartementFromCpFR('69003')).toBe('69')
  })

  it('keeps 3 digits overseas', () => {
    expect(extractDepartementFromCpFR('97400')).toBe('974')
    expect(extractDepartementFromCpFR('97150')).toBe('971')
  })

  it('handles Corsican prefixes', () => {
    expect(extractDepartementFromCpFR('20000')).toBe('2A')
    expect(extractDepartementFromCpFR('20200')).toBe('2B')
  })

  it('returns null on garbage / nullish', () => {
    expect(extractDepartementFromCpFR(undefined)).toBe(null)
    expect(extractDepartementFromCpFR(null)).toBe(null)
    expect(extractDepartementFromCpFR('XYZ')).toBe(null)
  })
})

describe('resolveSireneName', () => {
  it('prefers denominationUniteLegale for companies', () => {
    const et = {
      siret: '12345678900015',
      uniteLegale: { denominationUniteLegale: 'ACME SAS', nomUniteLegale: 'Smith' },
    }
    expect(resolveSireneName(et)).toBe('ACME SAS')
  })

  it('concatenates prenom + nom for individuals', () => {
    const et = {
      siret: '12345678900015',
      uniteLegale: { nomUniteLegale: 'Dupont', prenom1UniteLegale: 'Marie' },
    }
    expect(resolveSireneName(et)).toBe('Marie Dupont')
  })

  it('returns null when nothing usable', () => {
    const et = { siret: '12345678900015', uniteLegale: {} }
    expect(resolveSireneName(et)).toBe(null)
  })
})
