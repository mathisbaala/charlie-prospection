import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rppsSource, computeRppsMatchScore } from '../rpps'

vi.mock('@/lib/data-sources/pappers', () => ({
  searchEntreprises: vi.fn(),
  getEntrepriseRepresentants: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { searchEntreprises, getEntrepriseRepresentants } from '@/lib/data-sources/pappers'
import { createClient } from '@/lib/supabase/server'

const fakeRppsRow = {
  rpps_id: 'RPPS123456789',
  nom: 'DURAND',
  prenom: 'Marie',
  profession: 'Médecin',
  specialite: 'Médecine générale',
  mode_exercice: 'L',
  ville: 'LYON',
  code_postal: '69003',
}

const fakeAe = {
  siren: '987654321',
  nom_entreprise: 'SELARL DR DURAND',
  code_naf: '86.21Z',
  libelle_code_naf: 'Médecine générale',
  date_creation: '2012-06-01',
  tranche_effectif: '01',
  siege: { code_postal: '69003', ville: 'LYON', departement: '69' },
}
const fakeRep = {
  nom: 'DURAND',
  prenom: 'Marie',
  prenom_usuel: 'Marie',
  qualite: 'Médecin',
  personne_morale: false,
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('computeRppsMatchScore', () => {
  it('returns high score for exact nom+prenom+ville match with SELARL', () => {
    const score = computeRppsMatchScore(
      { nom: 'DURAND', prenom: 'Marie', ville: 'LYON', dept: '69' },
      {
        nom: 'DURAND',
        prenom_usuel: 'Marie',
        prenom: 'Marie',
        nom_entreprise: 'SELARL DR DURAND',
        siege: { ville: 'LYON', departement: '69' },
      },
    )
    expect(score).toBeGreaterThanOrEqual(70)
  })

  it('returns 0 when nom does not match', () => {
    const score = computeRppsMatchScore(
      { nom: 'DURAND', prenom: 'Marie', ville: 'LYON', dept: '69' },
      {
        nom: 'MARTIN',
        prenom_usuel: 'Sophie',
        prenom: 'Sophie',
        nom_entreprise: 'CABINET MARTIN',
        siege: { ville: 'PARIS', departement: '75' },
      },
    )
    expect(score).toBeLessThan(70)
  })

  it('gives partial credit for initial match on prenom', () => {
    const score = computeRppsMatchScore(
      { nom: 'DURAND', prenom: 'Marie', ville: 'LYON', dept: '69' },
      {
        nom: 'DURAND',
        prenom_usuel: 'M',
        prenom: 'M',
        nom_entreprise: 'CABINET DURAND',
        siege: { ville: 'LYON', departement: '69' },
      },
    )
    // nom(50) + initial(10) + ville(20) = 80 ≥ 70
    expect(score).toBeGreaterThanOrEqual(70)
  })

  it('falls back to dept match when ville differs', () => {
    const score = computeRppsMatchScore(
      { nom: 'DURAND', prenom: 'Marie', ville: 'VILLEURBANNE', dept: '69' },
      {
        nom: 'DURAND',
        prenom_usuel: 'Marie',
        prenom: 'Marie',
        nom_entreprise: 'CABINET DURAND',
        siege: { ville: 'LYON', departement: '69' },
      },
    )
    // nom(50) + prenom(20) + dept(10) = 80 ≥ 70
    expect(score).toBeGreaterThanOrEqual(70)
  })
})

describe('rppsSource', () => {
  it('returns empty array when cache query fails', async () => {
    const fakeSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            ilike: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
            }),
          }),
        }),
      }),
    }
    vi.mocked(createClient).mockResolvedValue(fakeSupabase as never)
    const result = await rppsSource.discover({ departement: '69', profession: 'Medecin' })
    expect(result).toEqual([])
  })

  it('returns empty array when no dept provided', async () => {
    const result = await rppsSource.discover({ profession: 'Medecin' })
    expect(result).toEqual([])
  })
})
