import { describe, it, expect } from 'vitest'
import { buildInfogreffeUrl, isValidSiren } from '../infogreffe'

describe('isValidSiren', () => {
  it('accepts a standard 9-digit SIREN', () => {
    expect(isValidSiren('123456789')).toBe(true)
  })

  it('accepts SIREN with internal whitespace (Pappers legacy data)', () => {
    expect(isValidSiren('123 456 789')).toBe(true)
  })

  it('rejects 8 digits (too short)', () => {
    expect(isValidSiren('12345678')).toBe(false)
  })

  it('rejects 14 digits (SIRET, not SIREN)', () => {
    expect(isValidSiren('12345678900001')).toBe(false)
  })

  it('rejects letters', () => {
    expect(isValidSiren('12345678A')).toBe(false)
  })

  it('rejects undefined', () => {
    expect(isValidSiren(undefined)).toBe(false)
  })

  it('rejects null', () => {
    expect(isValidSiren(null)).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidSiren('')).toBe(false)
  })
})

describe('buildInfogreffeUrl', () => {
  it('produces the canonical deep-link for a valid SIREN', () => {
    const link = buildInfogreffeUrl('552120222')
    expect(link).not.toBeNull()
    expect(link!.url).toBe(
      'https://www.infogreffe.fr/societes/entreprise-societe/552120222',
    )
    expect(link!.is_fallback).toBe(false)
  })

  it('strips internal whitespace from the SIREN before building the URL', () => {
    const link = buildInfogreffeUrl('552 120 222')
    expect(link!.url).toContain('/552120222')
  })

  it('honors is_fallback option', () => {
    const link = buildInfogreffeUrl('552120222', { is_fallback: true })
    expect(link!.is_fallback).toBe(true)
  })

  it('returns null on invalid SIREN', () => {
    expect(buildInfogreffeUrl('')).toBeNull()
    expect(buildInfogreffeUrl(undefined)).toBeNull()
    expect(buildInfogreffeUrl('12345')).toBeNull()
    expect(buildInfogreffeUrl('not-a-siren')).toBeNull()
  })
})
