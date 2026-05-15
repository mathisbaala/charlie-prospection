import { describe, it, expect } from 'vitest'
import {
  ALLOWED_ACTIVITY_KINDS,
  isValidActivityKind,
  parseActivityInput,
} from '../activity-helpers'

describe('isValidActivityKind', () => {
  it.each(ALLOWED_ACTIVITY_KINDS)('accepts %s', (kind) => {
    expect(isValidActivityKind(kind)).toBe(true)
  })

  it('rejects unknown strings', () => {
    expect(isValidActivityKind('phone')).toBe(false)
    expect(isValidActivityKind('NOTE')).toBe(false) // case sensitive
    expect(isValidActivityKind('')).toBe(false)
  })

  it('rejects non-strings', () => {
    expect(isValidActivityKind(null)).toBe(false)
    expect(isValidActivityKind(undefined)).toBe(false)
    expect(isValidActivityKind(42)).toBe(false)
    expect(isValidActivityKind({})).toBe(false)
  })
})

describe('parseActivityInput', () => {
  it('parses a valid note', () => {
    const result = parseActivityInput({ kind: 'note', body: 'Bon contact' })
    expect(result).toEqual({ ok: true, kind: 'note', body: 'Bon contact', occurredAt: undefined })
  })

  it('trims body whitespace', () => {
    const result = parseActivityInput({ kind: 'call', body: '  Appel pris  ' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.body).toBe('Appel pris')
  })

  it('passes through occurred_at when string', () => {
    const result = parseActivityInput({
      kind: 'meeting',
      body: 'RDV',
      occurred_at: '2026-05-10T14:00:00Z',
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.occurredAt).toBe('2026-05-10T14:00:00Z')
  })

  it('rejects when payload is null/undefined', () => {
    expect(parseActivityInput(null)).toEqual({ ok: false, error: 'payload manquant' })
    expect(parseActivityInput(undefined)).toEqual({ ok: false, error: 'payload manquant' })
  })

  it('rejects unknown kind', () => {
    const r = parseActivityInput({ kind: 'sms', body: 'x' })
    expect(r).toEqual({ ok: false, error: 'kind invalide' })
  })

  it('rejects missing body', () => {
    const r = parseActivityInput({ kind: 'note' })
    expect(r).toEqual({ ok: false, error: 'body requis' })
  })

  it('rejects empty body after trim', () => {
    const r = parseActivityInput({ kind: 'note', body: '   ' })
    expect(r).toEqual({ ok: false, error: 'body requis' })
  })

  it('rejects body of wrong type', () => {
    const r = parseActivityInput({ kind: 'note', body: 42 })
    expect(r).toEqual({ ok: false, error: 'body requis' })
  })

  it('ignores extra fields silently', () => {
    const r = parseActivityInput({
      kind: 'note',
      body: 'x',
      malicious: 'rm -rf',
      created_by: 'someone-else',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      // Only kind, body, occurredAt are returned — extra fields don't leak.
      expect(Object.keys(r).sort()).toEqual(['body', 'kind', 'occurredAt', 'ok'])
    }
  })
})
