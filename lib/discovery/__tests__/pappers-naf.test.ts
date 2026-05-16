import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pappersNafSource } from '../pappers-naf'

vi.mock('@/lib/data-sources/pappers', () => ({
  searchEntreprises: vi.fn(),
  getEntrepriseRepresentants: vi.fn(),
}))

import {
  searchEntreprises,
  getEntrepriseRepresentants,
} from '@/lib/data-sources/pappers'

const fakeAe = {
  siren: '123456789',
  nom_entreprise: 'DUPONT MEDECIN',
  code_naf: '86.21Z',
  libelle_code_naf: 'Médecine générale',
  date_creation: '2015-01-15',
  tranche_effectif: '01',
  effectif_max: 2,
  siege: { code_postal: '69001', ville: 'LYON', departement: '69' },
}
const fakeRep = {
  nom: 'DUPONT',
  prenom: 'Jean',
  prenom_usuel: 'Jean',
  qualite: 'Médecin',
  personne_morale: false,
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('pappersNafSource', () => {
  it('returns empty array when searchEntreprises returns nothing', async () => {
    vi.mocked(searchEntreprises).mockResolvedValue({ resultats: [], total: 0 })
    const result = await pappersNafSource.discover({ naf_code: '86.21Z', departement: '69' })
    expect(result).toEqual([])
  })

  it('builds RawProspect with source pappers from valid ae+rep', async () => {
    vi.mocked(searchEntreprises).mockResolvedValue({ resultats: [fakeAe], total: 1 })
    vi.mocked(getEntrepriseRepresentants).mockResolvedValue([fakeRep])
    const result = await pappersNafSource.discover({ naf_code: '86.21Z', departement: '69' })
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('pappers')
    expect(result[0].siren).toBe('123456789')
    expect(result[0].dirigeant_nom).toBe('DUPONT')
  })

  it('skips entries with no representatives', async () => {
    vi.mocked(searchEntreprises).mockResolvedValue({ resultats: [fakeAe], total: 1 })
    vi.mocked(getEntrepriseRepresentants).mockResolvedValue([])
    const result = await pappersNafSource.discover({ naf_code: '86.21Z', departement: '69' })
    expect(result).toHaveLength(0)
  })

  it('respects limit param', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      ...fakeAe,
      siren: String(100000000 + i),
    }))
    vi.mocked(searchEntreprises).mockResolvedValue({ resultats: many, total: 30 })
    vi.mocked(getEntrepriseRepresentants).mockResolvedValue([fakeRep])
    const result = await pappersNafSource.discover({ naf_code: '86.21Z', limit: 5 })
    expect(result.length).toBeLessThanOrEqual(5)
  })

  it('deduplicates same uid across results', async () => {
    // Same siren twice → same uid → only 1 result
    vi.mocked(searchEntreprises).mockResolvedValue({
      resultats: [fakeAe, { ...fakeAe }],
      total: 2,
    })
    vi.mocked(getEntrepriseRepresentants).mockResolvedValue([fakeRep])
    const result = await pappersNafSource.discover({ naf_code: '86.21Z' })
    expect(result.length).toBe(1)
  })
})
