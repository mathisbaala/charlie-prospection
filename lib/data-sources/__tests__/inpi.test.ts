import { describe, it, expect } from 'vitest'
import { mapInpiTypeToEvent } from '../inpi'

describe('mapInpiTypeToEvent', () => {
  it.each([
    ['CREATION', 'creation'],
    ['IMMATRICULATION', 'creation'],
    ['CESSATION', 'radiation'],
    ['RADIATION', 'radiation'],
    ['PROCEDURE_COLLECTIVE', 'procedure_collective'],
    ['MODIFICATION_CAPITAL', 'modif_capital'],
    ['MODIFICATION_BENEFICIAIRE', 'modif_beneficiaire'],
    ['MODIFICATION_BENEFICIARY', 'modif_beneficiaire'],
    ['TRANSFERT_SIEGE', 'modification'],
    ['MODIFICATION', 'modification'],
  ])('maps %s to %s', (inpi, expected) => {
    expect(mapInpiTypeToEvent(inpi)).toBe(expected)
  })

  it('returns autre for unknown / nullish', () => {
    expect(mapInpiTypeToEvent(undefined)).toBe('autre')
    expect(mapInpiTypeToEvent(null)).toBe('autre')
    expect(mapInpiTypeToEvent('SOMETHING_NEW')).toBe('autre')
  })

  it('is case-insensitive', () => {
    expect(mapInpiTypeToEvent('creation')).toBe('creation')
    expect(mapInpiTypeToEvent('Modification_Capital')).toBe('modif_capital')
  })
})
