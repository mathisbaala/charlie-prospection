import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sireneCreationsSource } from '../sirene-creations'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('@/lib/data-sources/annuaire-entreprises', () => ({
  getEntrepriseBySiren: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getEntrepriseBySiren } from '@/lib/data-sources/annuaire-entreprises'

const fakeRow = {
  siren: '123456789',
  code_naf: '8621Z',
  entreprise_nom: 'CABINET DR LEBLANC',
  departement: '69',
  date_event: '2026-04-01',
}

const fakeAe = {
  siren: '123456789',
  nom_complet: 'CABINET DR LEBLANC',
  activite_principale: '86.21Z',
  libelle_activite_principale: 'Médecine générale',
  date_creation: '2026-04-01',
  tranche_effectif_salarie: '00',
  siege: {
    code_postal: '69003',
    libelle_commune: 'LYON',
    departement: '69',
    adresse: '12 RUE DE LA PAIX',
  },
  dirigeants: [
    { nom: 'LEBLANC', prenoms: 'Jean', qualite: 'Médecin' },
  ],
}

// Supabase chainable builder — handles select, eq, gte, in, order, limit
function makeSupabaseMock(data: unknown, error: unknown = null) {
  const terminal = { data, error }
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'in', 'order']) {
    chain[m] = () => chain
  }
  chain.limit = () => Promise.resolve(terminal)
  return { from: () => chain }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('sireneCreationsSource', () => {
  it('returns empty array when Supabase returns an error', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock(null, new Error('DB error')) as never,
    )
    const result = await sireneCreationsSource.discover({ departement: '69' })
    expect(result).toEqual([])
  })

  it('returns empty array when inbox has no rows', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock([]) as never)
    const result = await sireneCreationsSource.discover({ departement: '69' })
    expect(result).toEqual([])
  })

  it('builds RawProspect from inbox row + AE data', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock([fakeRow]) as never)
    vi.mocked(getEntrepriseBySiren).mockResolvedValue(fakeAe as never)

    const result = await sireneCreationsSource.discover({ departement: '69' })
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('sirene_creations')
    expect(result[0].siren).toBe('123456789')
    expect(result[0].dirigeant_nom).toBe('LEBLANC')
    expect(result[0].dirigeant_prenom).toBe('Jean')
    expect(result[0].score_initial).toBe(30)
  })

  it('skips rows where AE lookup returns null', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock([fakeRow]) as never)
    vi.mocked(getEntrepriseBySiren).mockResolvedValue(null)

    const result = await sireneCreationsSource.discover({ departement: '69' })
    expect(result).toHaveLength(0)
  })

  it('skips rows where dirigeant is a société (nom contient SARL)', async () => {
    const aeWithSarlDirigeant = {
      ...fakeAe,
      dirigeants: [{ nom: 'CABINET LEBLANC SARL', prenoms: '', qualite: 'Gérant' }],
    }
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock([fakeRow]) as never)
    vi.mocked(getEntrepriseBySiren).mockResolvedValue(aeWithSarlDirigeant as never)

    const result = await sireneCreationsSource.discover({ departement: '69' })
    expect(result).toHaveLength(0)
  })

  it('deduplicates rows with same uid', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock([fakeRow, fakeRow]) as never,
    )
    vi.mocked(getEntrepriseBySiren).mockResolvedValue(fakeAe as never)

    const result = await sireneCreationsSource.discover({ departement: '69' })
    expect(result).toHaveLength(1)
  })

  it('works without departement filter (requête nationale)', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock([fakeRow]) as never)
    vi.mocked(getEntrepriseBySiren).mockResolvedValue(fakeAe as never)

    const result = await sireneCreationsSource.discover({ naf_code: '86.21Z' })
    expect(result).toHaveLength(1)
  })
})
