import { describe, it, expect } from 'vitest'
import { slugify } from '../slugify'

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

  it('collapses non-alphanumeric runs and trims edges', () => {
    expect(slugify('  ---hello---world---  ')).toBe('hello-world')
  })

  it('handles empty input', () => {
    expect(slugify('')).toBe('')
  })
})
