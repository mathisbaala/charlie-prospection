import { describe, it, expect } from 'vitest'
import { freshnessWeight } from '../patrimony-scorer'

describe('freshnessWeight', () => {
  const NOW = new Date('2026-05-15T00:00:00Z')

  it('weights signals from the last 30 days at 1.0', () => {
    expect(freshnessWeight('2026-05-10T00:00:00Z', NOW)).toBe(1.0)
    expect(freshnessWeight('2026-04-20T00:00:00Z', NOW)).toBe(1.0)
  })

  it('weights signals 30–90 days old at 0.7', () => {
    expect(freshnessWeight('2026-03-20T00:00:00Z', NOW)).toBe(0.7)
  })

  it('weights signals 90–180 days old at 0.4', () => {
    expect(freshnessWeight('2026-01-15T00:00:00Z', NOW)).toBe(0.4)
  })

  it('weights signals older than 180 days at 0.1', () => {
    expect(freshnessWeight('2025-08-01T00:00:00Z', NOW)).toBe(0.1)
  })

  it('returns 0.1 for an unparseable date string', () => {
    expect(freshnessWeight('not-a-date', NOW)).toBe(0.1)
  })
})
