import { describe, it, expect } from 'vitest'
import { mapInpiTypeToEvent } from '../inpi'
import { buildInpiInboxRow } from '@/app/api/cron/inpi-ingest/route'

describe('mapInpiTypeToEvent', () => {
  it.each([
    // creation pathway
    ['CREATION', 'creation'],
    ['IMMATRICULATION', 'creation'],
    // radiation pathway
    ['CESSATION', 'radiation'],
    ['RADIATION', 'radiation'],
    ['DISSOLUTION', 'radiation'],
    // procédures collectives
    ['PROCEDURE_COLLECTIVE', 'procedure_collective'],
    ['Procédure collective ouverture', 'procedure_collective'],
    // capital — high-signal patrimonial event
    ['MODIFICATION_CAPITAL', 'modif_capital'],
    ['AUGMENTATION_CAPITAL', 'modif_capital'],
    ['REDUCTION_DE_CAPITAL', 'modif_capital'],
    // bénéficiaires effectifs
    ['MODIFICATION_BENEFICIAIRE', 'modif_beneficiaire'],
    ['MODIFICATION_BENEFICIARY', 'modif_beneficiaire'],
    ['MODIFICATION_BENEFICIAIRE_EFFECTIF', 'modif_beneficiaire'],
    // dépôt des comptes
    ['DEPOT_COMPTES', 'depot_comptes'],
    ['DEPOT_DES_COMPTES', 'depot_comptes'],
    // dépôt actes — distinct from comptes (modif générique)
    ['DEPOT_ACTES', 'modification'],
    // generic modifications
    ['TRANSFERT_SIEGE', 'modification'],
    ['MODIFICATION_DIRIGEANT', 'modification'],
    ['MODIFICATION', 'modification'],
  ])('maps %s → %s', (inpi, expected) => {
    expect(mapInpiTypeToEvent(inpi)).toBe(expected)
  })

  it('returns autre for unknown / nullish', () => {
    expect(mapInpiTypeToEvent(undefined)).toBe('autre')
    expect(mapInpiTypeToEvent(null)).toBe('autre')
    expect(mapInpiTypeToEvent('SOMETHING_NEW')).toBe('autre')
    expect(mapInpiTypeToEvent('')).toBe('autre')
  })

  it('is case-insensitive', () => {
    expect(mapInpiTypeToEvent('creation')).toBe('creation')
    expect(mapInpiTypeToEvent('Modification_Capital')).toBe('modif_capital')
    expect(mapInpiTypeToEvent('depot_comptes')).toBe('depot_comptes')
  })

  it('order matters: capital > generic modification', () => {
    // "MODIFICATION_CAPITAL" must NOT fall through to 'modification'
    expect(mapInpiTypeToEvent('MODIFICATION_CAPITAL')).toBe('modif_capital')
  })

  it('order matters: beneficiaire > generic modification', () => {
    expect(mapInpiTypeToEvent('MODIFICATION_BENEFICIAIRE_EFFECTIF')).toBe('modif_beneficiaire')
  })

  it('order matters: depot_comptes wins over depot_actes (more specific)', () => {
    expect(mapInpiTypeToEvent('DEPOT_COMPTES')).toBe('depot_comptes')
    expect(mapInpiTypeToEvent('DEPOT_ACTES')).toBe('modification')
  })
})

describe('buildInpiInboxRow', () => {
  it('builds a complete inbox row from a typical formality', () => {
    const row = buildInpiInboxRow({
      id: 'inpi-evt-12345',
      dateEvenement: '2026-05-10T14:00:00Z',
      siren: '123456789',
      denomination: 'ACME SAS',
      codeAPE: '62.01Z',
      codePostal: '75001',
      typeEvenement: 'MODIFICATION_CAPITAL',
    })

    expect(row).not.toBeNull()
    expect(row!.source).toBe('inpi')
    expect(row!.external_id).toBe('inpi-evt-12345')
    expect(row!.siren).toBe('123456789')
    expect(row!.entreprise_nom).toBe('ACME SAS')
    expect(row!.code_naf).toBe('6201Z') // dot stripped + upper
    expect(row!.departement).toBe('75')
    expect(row!.type_event).toBe('modif_capital')
    expect(row!.date_event).toBe('2026-05-10T14:00:00.000Z')
  })

  it('returns null when id is missing (skipped_invalid path)', () => {
    expect(buildInpiInboxRow({} as never)).toBeNull()
    expect(buildInpiInboxRow({ id: '' } as never)).toBeNull()
  })

  it('falls back to now() when dateEvenement is missing', () => {
    const before = Date.now()
    const row = buildInpiInboxRow({ id: 'x', typeEvenement: 'CREATION' })
    const after = Date.now()
    expect(row).not.toBeNull()
    const eventTs = new Date(row!.date_event).getTime()
    expect(eventTs).toBeGreaterThanOrEqual(before)
    expect(eventTs).toBeLessThanOrEqual(after)
  })

  it('normalises NAF (strip dots + uppercase)', () => {
    expect(buildInpiInboxRow({ id: '1', codeAPE: '86.21z' })!.code_naf).toBe('8621Z')
    expect(buildInpiInboxRow({ id: '2', codeAPE: '8621Z' })!.code_naf).toBe('8621Z')
    expect(buildInpiInboxRow({ id: '3', codeAPE: undefined })!.code_naf).toBeNull()
  })

  it('handles Corsican CP → 2A / 2B', () => {
    expect(buildInpiInboxRow({ id: '1', codePostal: '20000' })!.departement).toBe('2A')
    expect(buildInpiInboxRow({ id: '2', codePostal: '20200' })!.departement).toBe('2B')
  })

  it('handles overseas (97x) keeps 3 digits', () => {
    expect(buildInpiInboxRow({ id: '1', codePostal: '97400' })!.departement).toBe('974')
  })

  it('preserves raw formality in raw_data for downstream enrichment', () => {
    const formality = {
      id: 'x',
      siren: '111',
      denomination: 'TEST',
      typeEvenement: 'CREATION',
      // Custom INPI fields we don't model but want to keep
      tribunal: 'PARIS',
      libelle_long: 'Création de société commerciale',
    } as never
    const row = buildInpiInboxRow(formality)
    expect(row!.raw_data).toEqual(formality)
  })

  it('returns null denomination + null siren without throwing', () => {
    const row = buildInpiInboxRow({ id: 'x', typeEvenement: 'CREATION' } as never)
    expect(row).not.toBeNull()
    expect(row!.siren).toBeNull()
    expect(row!.entreprise_nom).toBeNull()
    expect(row!.type_event).toBe('creation')
  })
})
