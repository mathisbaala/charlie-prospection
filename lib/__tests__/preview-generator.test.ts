import { describe, it, expect } from 'vitest'
import { generatePreview } from '../preview-generator'

describe('preview-generator', () => {
  it('produces deterministic output for the same query', () => {
    const a = generatePreview('Chirurgiens lyonnais')
    const b = generatePreview('Chirurgiens lyonnais')
    expect(a.count).toBe(b.count)
    expect(a.cards).toEqual(b.cards)
  })

  it('produces different output for different queries', () => {
    const a = generatePreview('Chirurgiens lyonnais')
    const b = generatePreview('Vétérinaires Bordeaux')
    expect(a.count).not.toBe(b.count)
  })

  it('count is between 50 and 249', () => {
    for (const q of ['a', 'comptables', 'CEO engrais bio', 'x'.repeat(200)]) {
      const { count } = generatePreview(q)
      expect(count).toBeGreaterThanOrEqual(50)
      expect(count).toBeLessThanOrEqual(249)
    }
  })

  it('returns exactly 4 cards', () => {
    expect(generatePreview('comptables Gironde').cards).toHaveLength(4)
  })

  it('each card has score 65-95', () => {
    const { cards } = generatePreview('Vendeurs récents BODACC')
    for (const c of cards) {
      expect(c.score).toBeGreaterThanOrEqual(65)
      expect(c.score).toBeLessThanOrEqual(95)
    }
  })

  it('each card has city, naf, signals', () => {
    const { cards } = generatePreview('Dirigeants PME')
    for (const c of cards) {
      expect(typeof c.city).toBe('string')
      expect(c.city.length).toBeGreaterThan(0)
      expect(c.naf).toMatch(/^\d{4}[A-Z]$/)
      expect(Array.isArray(c.signals)).toBe(true)
      expect(c.signals.length).toBeGreaterThan(0)
    }
  })

  it('handles empty query gracefully', () => {
    const { count, cards } = generatePreview('')
    expect(count).toBeGreaterThanOrEqual(50)
    expect(cards).toHaveLength(4)
  })
})
