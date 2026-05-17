import { describe, it, expect, beforeEach } from 'vitest'
import { storePendingDescription, consumePendingDescription } from '../pending-description'

describe('pending-description', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('stores then consumes the description (one-shot)', () => {
    storePendingDescription('Chirurgiens lyonnais')
    expect(consumePendingDescription()).toBe('Chirurgiens lyonnais')
    expect(consumePendingDescription()).toBeNull()
  })

  it('returns null when nothing stored', () => {
    expect(consumePendingDescription()).toBeNull()
  })

  it('overwrites previous value', () => {
    storePendingDescription('A')
    storePendingDescription('B')
    expect(consumePendingDescription()).toBe('B')
  })

  it('trims whitespace on store', () => {
    storePendingDescription('  hello  ')
    expect(consumePendingDescription()).toBe('hello')
  })

  it('ignores empty strings on store', () => {
    storePendingDescription('   ')
    expect(consumePendingDescription()).toBeNull()
  })
})
