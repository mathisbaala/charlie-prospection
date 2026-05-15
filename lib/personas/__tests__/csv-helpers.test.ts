import { describe, it, expect } from 'vitest'
import { escapeCsvCell, buildCsvRow, prospectToCsvRow, buildProspectsCsv } from '../csv-helpers'
import type { Icp, Prospect } from '@/lib/types'

describe('escapeCsvCell — RFC 4180 conformance', () => {
  it('passes through plain values', () => {
    expect(escapeCsvCell('Durand')).toBe('Durand')
    expect(escapeCsvCell(42)).toBe('42')
    expect(escapeCsvCell(0)).toBe('0')
  })

  it('treats null/undefined as empty', () => {
    expect(escapeCsvCell(null)).toBe('')
    expect(escapeCsvCell(undefined)).toBe('')
  })

  it('wraps and doubles quotes inside values', () => {
    expect(escapeCsvCell('Hello "world"')).toBe('"Hello ""world"""')
  })

  it('wraps values containing commas', () => {
    expect(escapeCsvCell('Lyon, France')).toBe('"Lyon, France"')
  })

  it('wraps values with newlines (avoid row split)', () => {
    expect(escapeCsvCell('Line 1\nLine 2')).toBe('"Line 1\nLine 2"')
  })

  it('strips control characters that break Excel', () => {
    expect(escapeCsvCell('A\x00B\x07C')).toBe('ABC')
  })

  it('converts tabs to spaces', () => {
    expect(escapeCsvCell('A\tB')).toBe('A B')
  })
})

describe('buildCsvRow', () => {
  it('joins cells with commas', () => {
    expect(buildCsvRow(['a', 'b', 'c'])).toBe('a,b,c')
  })

  it('quotes only cells that need it', () => {
    expect(buildCsvRow(['a', 'b,c', 'd'])).toBe('a,"b,c",d')
  })

  it('handles mixed types', () => {
    expect(buildCsvRow(['name', 42, null, undefined, 'x'])).toBe('name,42,,,x')
  })
})

describe('prospectToCsvRow', () => {
  function makeProspect(overrides: Partial<Prospect> = {}): Prospect {
    return {
      id: 'p1',
      org_id: 'o1',
      icp_id: 'i1',
      linkedin_url: 'https://linkedin.com/in/jane-durand',
      linkedin_data: { prenom: 'Jane', nom_de_famille: 'Durand', entreprise: 'ACME', titre: 'CEO' },
      enrichment_data: {
        siren: '123456789',
        code_naf: '8621Z',
        libelle_naf: 'Médecine',
        ville: 'Paris',
        departement: '75',
        chiffre_affaires_dernier: 1_500_000,
        patrimoine_total_estime: 3_200_000,
      },
      patrimony_score: 78,
      icp_score: 65,
      crm_stage: 'to_contact',
      created_at: '2026-05-15T12:00:00Z',
      last_signal_at: '2026-05-14T08:00:00Z',
      ...overrides,
    } as Prospect
  }

  it('produces a row matching the header order with persona name', () => {
    const row = prospectToCsvRow(makeProspect(), 'PME Tech V1')
    expect(row).toContain('Durand')
    expect(row).toContain('Jane')
    expect(row).toContain('ACME')
    expect(row).toContain('CEO')
    expect(row).toContain('PME Tech V1')
    expect(row).toContain('to_contact')
    expect(row).toContain('78')
    expect(row).toContain('1500000')
    expect(row).toContain('3200000')
    expect(row).toContain('123456789')
  })

  it('handles missing enrichment / linkedin data gracefully', () => {
    const p = makeProspect({
      linkedin_data: {},
      enrichment_data: {},
      patrimony_score: null,
      last_signal_at: null,
    })
    const row = prospectToCsvRow(p, null)
    // Empty cells should serialise as empty strings — count commas should equal header count - 1.
    expect(row.split(',').length).toBeGreaterThanOrEqual(15)
  })

  it('escapes commas in company names', () => {
    const p = makeProspect({
      linkedin_data: { entreprise: 'ACME, SA' },
    })
    const row = prospectToCsvRow(p, null)
    expect(row).toContain('"ACME, SA"')
  })
})

describe('buildProspectsCsv', () => {
  it('emits BOM + header + per-prospect rows', () => {
    const personas: Icp[] = [
      { id: 'i1', name: 'PME Tech V1' } as Icp,
    ]
    const prospect: Prospect = {
      id: 'p1',
      org_id: 'o1',
      icp_id: 'i1',
      linkedin_url: '',
      linkedin_data: { prenom: 'Jean', nom_de_famille: 'Dupont' },
      enrichment_data: {},
      patrimony_score: 50,
      icp_score: 30,
      crm_stage: 'new',
      created_at: '2026-05-15T00:00:00Z',
      last_signal_at: null,
    } as Prospect

    const csv = buildProspectsCsv([prospect], personas)
    expect(csv.startsWith('﻿')).toBe(true) // UTF-8 BOM for Excel
    expect(csv).toContain('id,nom,prenom,entreprise')
    expect(csv).toContain('Dupont')
    expect(csv).toContain('PME Tech V1')
    // Lines separated by CRLF per RFC 4180
    expect(csv).toContain('\r\n')
  })

  it('handles prospects without persona (icp_id null)', () => {
    const prospect: Prospect = {
      id: 'p1', org_id: 'o1', icp_id: null,
      linkedin_url: '', linkedin_data: {}, enrichment_data: {},
      patrimony_score: null, icp_score: null,
      crm_stage: 'new',
      created_at: '2026-05-15T00:00:00Z',
      last_signal_at: null,
    } as Prospect
    const csv = buildProspectsCsv([prospect], [])
    expect(csv).toContain('p1')
    expect(csv).not.toContain('undefined')
  })

  it('emits header only when no prospects', () => {
    const csv = buildProspectsCsv([], [])
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(1) // just the header line
  })
})
