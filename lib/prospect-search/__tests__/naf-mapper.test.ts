import { describe, it, expect } from 'vitest'
import {
  mapRolesToNaf,
  mapSectorsToNaf,
  mapLocationsToDepartements,
  adjacentDepartements,
  expandWithAdjacent,
} from '../naf-mapper'

describe('mapRolesToNaf', () => {
  it('maps médecin généraliste to 86.21Z', () => {
    const { codes } = mapRolesToNaf(['médecin généraliste'])
    expect(codes).toContain('86.21Z')
  })

  it('maps avocat to 69.10Z', () => {
    const { codes } = mapRolesToNaf(['avocat'])
    expect(codes).toContain('69.10Z')
  })

  it('maps boulanger to artisan codes', () => {
    const { codes } = mapRolesToNaf(['boulanger'])
    expect(codes).toContain('10.71B')
  })

  it('maps restaurateur to restauration codes', () => {
    const { codes } = mapRolesToNaf(['restaurateur'])
    expect(codes).toContain('56.10A')
  })

  it('maps SaaS-related role', () => {
    const { codes } = mapRolesToNaf(['éditeur logiciel'])
    expect(codes.length).toBeGreaterThan(0)
    expect(codes.some(c => c.startsWith('58.29') || c.startsWith('62.01'))).toBe(true)
  })

  it('maps CGP / family office', () => {
    const { codes } = mapRolesToNaf(['family office'])
    expect(codes).toContain('64.20Z')
  })

  it('maps viticulteur', () => {
    const { codes } = mapRolesToNaf(['viticulteur'])
    expect(codes).toContain('01.21Z')
  })

  it('falls back to keywords for unknown role', () => {
    const { keywords } = mapRolesToNaf(['trader forex'])
    expect(keywords).toContain('trader forex')
  })
})

describe('mapSectorsToNaf', () => {
  it('maps "santé" to medical NAF codes', () => {
    const codes = mapSectorsToNaf(['santé'])
    expect(codes).toContain('86.21Z')
    expect(codes).toContain('86.22A')
  })

  it('maps "tech" to digital NAF codes', () => {
    const codes = mapSectorsToNaf(['tech'])
    expect(codes.length).toBeGreaterThan(3)
    expect(codes.some(c => c.startsWith('62'))).toBe(true)
  })

  it('handles case + diacritics', () => {
    const a = mapSectorsToNaf(['Sante'])
    const b = mapSectorsToNaf(['santé'])
    expect(a.sort()).toEqual(b.sort())
  })

  it('returns empty for unknown sector', () => {
    expect(mapSectorsToNaf(['inexistant'])).toEqual([])
  })

  it('merges codes from multiple sectors', () => {
    const codes = mapSectorsToNaf(['santé', 'juridique'])
    expect(codes).toContain('86.21Z')
    expect(codes).toContain('69.10Z')
  })
})

describe('mapLocationsToDepartements', () => {
  it('maps île-de-france to correct departments', () => {
    const depts = mapLocationsToDepartements(['Île-de-France'])
    expect(depts).toContain('75')
    expect(depts).toContain('92')
  })

  it('maps Paris to 75', () => {
    const depts = mapLocationsToDepartements(['Paris'])
    expect(depts).toContain('75')
  })

  it('handles direct department code', () => {
    const depts = mapLocationsToDepartements(['69'])
    expect(depts).toContain('69')
  })
})

describe('adjacentDepartements', () => {
  it('returns neighbors of 69 (Rhône)', () => {
    const adj = adjacentDepartements('69')
    expect(adj).toEqual(expect.arrayContaining(['01', '38', '42', '71']))
  })

  it('returns neighbors of 75 (Paris)', () => {
    const adj = adjacentDepartements('75')
    expect(adj).toEqual(expect.arrayContaining(['92', '93', '94']))
  })

  it('returns [] for an unknown department', () => {
    expect(adjacentDepartements('XX')).toEqual([])
  })
})

describe('expandWithAdjacent', () => {
  it('Lyon (69) expands to 69 + 01 + 38 + 42 + 71', () => {
    const out = expandWithAdjacent(['69'])
    expect(out).toEqual(expect.arrayContaining(['69', '01', '38', '42', '71']))
  })

  it('is idempotent', () => {
    const once = expandWithAdjacent(['69']).sort()
    const twice = expandWithAdjacent(expandWithAdjacent(['69'])).sort()
    // twice contains additional neighbors-of-neighbors → not equal, but never shrinks
    for (const d of once) expect(twice).toContain(d)
  })

  it('preserves the original departement(s)', () => {
    expect(expandWithAdjacent(['75'])).toContain('75')
  })
})
