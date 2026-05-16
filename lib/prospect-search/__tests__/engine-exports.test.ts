import { describe, it, expect } from 'vitest'
import { rawProspectFromPappers, deptFromCodePostal } from '../engine'
import type { PappersEntreprise, PappersRepresentant } from '@/lib/data-sources/pappers'

const fakeAe: PappersEntreprise = {
  siren: '123456789',
  nom_entreprise: 'DUPONT CONSEIL',
  code_naf: '86.21Z',
  libelle_code_naf: 'Médecine générale',
  date_creation: '2015-01-15',
  tranche_effectif: '01',
  siege: { code_postal: '69001', ville: 'LYON', departement: '69' },
}
const fakeRep: PappersRepresentant = {
  nom: 'DUPONT',
  prenom: 'Jean',
  prenom_usuel: 'Jean',
  qualite: 'Président',
  personne_morale: false,
}

describe('rawProspectFromPappers', () => {
  it('defaults to source pappers', () => {
    const p = rawProspectFromPappers(fakeAe, fakeRep)
    expect(p.source).toBe('pappers')
    expect(p.siren).toBe('123456789')
    expect(p.dirigeant_nom).toBe('DUPONT')
    expect(p.uid).toBeTruthy()
  })

  it('accepts source override', () => {
    const p = rawProspectFromPappers(fakeAe, fakeRep, 'bodacc_cessions')
    expect(p.source).toBe('bodacc_cessions')
  })

  it('overrides source to rpps', () => {
    const p = rawProspectFromPappers(fakeAe, fakeRep, 'rpps')
    expect(p.source).toBe('rpps')
  })
})

describe('deptFromCodePostal', () => {
  it('extracts 2-digit metro dept', () => {
    expect(deptFromCodePostal('75010')).toBe('75')
    expect(deptFromCodePostal('69001')).toBe('69')
  })

  it('handles Corsica', () => {
    expect(deptFromCodePostal('20000')).toBe('2A')
    expect(deptFromCodePostal('20200')).toBe('2B')
  })

  it('handles DOM-TOM', () => {
    expect(deptFromCodePostal('97100')).toBe('971')
  })

  it('returns empty string for missing input', () => {
    expect(deptFromCodePostal(undefined)).toBe('')
  })
})
