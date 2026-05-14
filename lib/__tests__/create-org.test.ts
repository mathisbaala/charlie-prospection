import { describe, it, expect } from 'vitest'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

describe('slugify', () => {
  it('converts cabinet name to slug', () => {
    expect(slugify('Cabinet Dupont Patrimoine')).toBe('cabinet-dupont-patrimoine')
  })
  it('handles accents', () => {
    expect(slugify('Société Générale')).toBe('societe-generale')
  })
  it('handles special characters', () => {
    expect(slugify('CGP & Associés')).toBe('cgp-associes')
  })
})
