import { describe, it, expect } from 'vitest'
import { classifyBodaccEvent, extractSirenFromRegistre, extractDepartementFromCp } from '../bodacc'

describe('classifyBodaccEvent', () => {
  // The strings below match the actual familleavis_lib values observed on the
  // BODACC firehose. If BODACC renames a category, these tests will catch it.
  it.each([
    // [familleavis_lib, expected type]
    ['Dépôts des comptes', 'depot_comptes'],
    ['Créations', 'creation'],
    ['Immatriculations', 'creation'],
    ['Modifications diverses', 'modification'],
    ['Radiations', 'radiation'],
    ['Procédures collectives', 'procedure_collective'],
    ['Ventes et cessions', 'cession'],
  ])('classifies familleavis_lib %s as %s', (familleavis_lib, expected) => {
    expect(classifyBodaccEvent({ id: 'x', dateparution: '2026-05-15', familleavis_lib })).toBe(expected)
  })

  it('falls back to typeavis_lib when familleavis_lib is missing', () => {
    expect(
      classifyBodaccEvent({ id: 'x', dateparution: '2026-05-15', typeavis_lib: 'Avis de dépôt des comptes annuels' }),
    ).toBe('depot_comptes')
  })

  it('handles unaccented typeavis_lib (defensive)', () => {
    expect(
      classifyBodaccEvent({ id: 'x', dateparution: '2026-05-15', familleavis_lib: 'depot des comptes' }),
    ).toBe('depot_comptes')
    expect(
      classifyBodaccEvent({ id: 'x', dateparution: '2026-05-15', familleavis_lib: 'procedure collective' }),
    ).toBe('procedure_collective')
  })

  it('returns "autre" when nothing matches', () => {
    expect(classifyBodaccEvent({ id: 'x', dateparution: '2026-05-15' })).toBe('autre')
    expect(
      classifyBodaccEvent({ id: 'x', dateparution: '2026-05-15', familleavis_lib: 'Quelque chose de totalement inconnu' }),
    ).toBe('autre')
  })

  it('prioritises dpc over modification (Dépôts des comptes is a modification but should be its own bucket)', () => {
    // Edge case: a BODACC record could in theory have both keywords; dpc wins
    expect(
      classifyBodaccEvent({ id: 'x', dateparution: '2026-05-15', familleavis_lib: 'Dépôt des comptes — modification' }),
    ).toBe('depot_comptes')
  })

  it('detects redressement/liquidation/sauvegarde as procedure_collective', () => {
    for (const lib of ['Redressement judiciaire', 'Liquidation judiciaire', 'Sauvegarde']) {
      expect(classifyBodaccEvent({ id: 'x', dateparution: '2026-05-15', familleavis_lib: lib })).toBe('procedure_collective')
    }
  })
})

describe('extractSirenFromRegistre', () => {
  it('extracts SIREN from a string', () => {
    expect(extractSirenFromRegistre('552 100 554 R.C.S Paris')).toBe('552100554')
  })

  it('extracts SIREN from an array', () => {
    expect(extractSirenFromRegistre(['552 100 554', 'R.C.S Paris'])).toBe('552100554')
  })

  it('returns null when no 9-digit sequence', () => {
    expect(extractSirenFromRegistre('R.C.S Paris')).toBe(null)
    expect(extractSirenFromRegistre(undefined)).toBe(null)
  })
})

describe('extractDepartementFromCp', () => {
  it('extracts 2-digit dept from mainland CP', () => {
    expect(extractDepartementFromCp('75001')).toBe('75')
    expect(extractDepartementFromCp('69003')).toBe('69')
  })

  it('keeps 3 digits for overseas (97x)', () => {
    expect(extractDepartementFromCp('97400')).toBe('974')
  })

  it('handles Corsican prefixes 2A/2B', () => {
    expect(extractDepartementFromCp('20000')).toBe('2A') // Ajaccio
    expect(extractDepartementFromCp('20200')).toBe('2B') // Bastia
  })

  it('returns null on garbage input', () => {
    expect(extractDepartementFromCp(undefined)).toBe(null)
    expect(extractDepartementFromCp('XYZ')).toBe(null)
  })
})
