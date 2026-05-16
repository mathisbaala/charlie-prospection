import { describe, it, expect, vi, beforeEach } from 'vitest'
import { bodaccCessionsSource } from '../bodacc-cessions'

vi.mock('@/lib/data-sources/bodacc', () => ({
  extractSirenFromRegistre: vi.fn(),
  classifyBodaccEvent: vi.fn(),
}))
vi.mock('@/lib/data-sources/pappers', () => ({
  getEntrepriseRepresentants: vi.fn(),
  searchEntreprises: vi.fn(),
}))
vi.mock('@/lib/observability/logger', () => ({
  timedFetch: vi.fn(),
}))

import { extractSirenFromRegistre, classifyBodaccEvent } from '@/lib/data-sources/bodacc'
import { getEntrepriseRepresentants, searchEntreprises } from '@/lib/data-sources/pappers'
import { timedFetch } from '@/lib/observability/logger'

const fakeRecord = {
  id: 'bodacc-1',
  dateparution: '2026-05-10',
  typeavis_lib: 'Vente et cession',
  familleavis_lib: 'Ventes et cessions',
  registre: '552100554 R.C.S. PARIS',
  numerodepartement: '69',
}
const fakeRep = {
  nom: 'MARTIN',
  prenom: 'Sophie',
  prenom_usuel: 'Sophie',
  qualite: 'Gérante',
  personne_morale: false,
}
const fakeAe = {
  siren: '552100554',
  nom_entreprise: 'MARTIN CONSEIL',
  code_naf: '69.10Z',
  libelle_code_naf: 'Activités juridiques',
  date_creation: '2010-03-01',
  tranche_effectif: '01',
  siege: { code_postal: '69002', ville: 'LYON', departement: '69' },
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('bodaccCessionsSource', () => {
  it('returns empty array when BODACC API returns nothing', async () => {
    vi.mocked(timedFetch).mockResolvedValue(new Response(JSON.stringify({ results: [] })))
    const result = await bodaccCessionsSource.discover({ departement: '69' })
    expect(result).toEqual([])
  })

  it('builds RawProspect with source bodacc_cessions from cession record', async () => {
    vi.mocked(timedFetch).mockResolvedValue(
      new Response(JSON.stringify({ results: [fakeRecord] })),
    )
    vi.mocked(classifyBodaccEvent).mockReturnValue('cession')
    vi.mocked(extractSirenFromRegistre).mockReturnValue('552100554')
    vi.mocked(searchEntreprises).mockResolvedValue({ resultats: [fakeAe], total: 1 })
    vi.mocked(getEntrepriseRepresentants).mockResolvedValue([fakeRep])

    const result = await bodaccCessionsSource.discover({ departement: '69' })
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('bodacc_cessions')
    expect(result[0].siren).toBe('552100554')
  })

  it('skips records with no extractable SIREN', async () => {
    vi.mocked(timedFetch).mockResolvedValue(
      new Response(JSON.stringify({ results: [{ ...fakeRecord, registre: undefined }] })),
    )
    vi.mocked(classifyBodaccEvent).mockReturnValue('cession')
    vi.mocked(extractSirenFromRegistre).mockReturnValue(null)

    const result = await bodaccCessionsSource.discover({ departement: '69' })
    expect(result).toHaveLength(0)
  })

  it('skips non-cession announcements', async () => {
    vi.mocked(timedFetch).mockResolvedValue(
      new Response(JSON.stringify({ results: [fakeRecord] })),
    )
    vi.mocked(classifyBodaccEvent).mockReturnValue('depot_comptes')
    vi.mocked(extractSirenFromRegistre).mockReturnValue('552100554')

    const result = await bodaccCessionsSource.discover({ departement: '69' })
    expect(result).toHaveLength(0)
  })

  it('skips cessions where Pappers returns no company', async () => {
    vi.mocked(timedFetch).mockResolvedValue(
      new Response(JSON.stringify({ results: [fakeRecord] })),
    )
    vi.mocked(classifyBodaccEvent).mockReturnValue('cession')
    vi.mocked(extractSirenFromRegistre).mockReturnValue('552100554')
    vi.mocked(searchEntreprises).mockResolvedValue({ resultats: [], total: 0 })

    const result = await bodaccCessionsSource.discover({ departement: '69' })
    expect(result).toHaveLength(0)
  })
})
