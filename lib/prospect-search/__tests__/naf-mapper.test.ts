import { describe, it, expect } from 'vitest'
import { mapRolesToNaf, mapLocationsToDepartements } from '../naf-mapper'

describe('mapRolesToNaf', () => {
  it('maps médecin généraliste to 86.21Z', () => {
    const { codes } = mapRolesToNaf(['médecin généraliste'])
    expect(codes).toContain('86.21Z')
  })

  it('maps avocat to 69.10Z', () => {
    const { codes } = mapRolesToNaf(['avocat'])
    expect(codes).toContain('69.10Z')
  })

  it('falls back to keywords for unknown role', () => {
    const { keywords } = mapRolesToNaf(['trader forex'])
    expect(keywords).toContain('trader forex')
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
