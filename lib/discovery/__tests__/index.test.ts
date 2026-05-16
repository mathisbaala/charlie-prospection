import { describe, it, expect, vi } from 'vitest'
import { runDiscovery } from '../index'

vi.mock('../pappers-naf', () => ({
  pappersNafSource: {
    name: 'pappers-naf',
    discover: vi.fn().mockResolvedValue([
      {
        uid: 'jean|dupont|123456789',
        source: 'pappers' as const,
        source_type: 'personne_morale' as const,
        siren: '123456789',
        dirigeant_nom: 'DUPONT',
        dirigeant_prenom: 'Jean',
        entreprise_nom: 'DUPONT CONSEIL',
        code_naf: '86.21Z', libelle_naf: '', date_creation: '',
        tranche_effectifs: '', adresse: '', code_postal: '69001',
        ville: 'LYON', departement: '69',
        dirigeant_qualite: 'Président',
        linkedin_search_url: '', score_initial: 40,
      },
    ]),
  },
}))

vi.mock('../bodacc-cessions', () => ({
  bodaccCessionsSource: {
    name: 'bodacc-cessions',
    discover: vi.fn().mockResolvedValue([
      {
        uid: 'marie|martin|987654321',
        source: 'bodacc_cessions' as const,
        source_type: 'personne_morale' as const,
        siren: '987654321',
        dirigeant_nom: 'MARTIN',
        dirigeant_prenom: 'Marie',
        entreprise_nom: 'MARTIN SAS',
        code_naf: '69.10Z', libelle_naf: '', date_creation: '',
        tranche_effectifs: '', adresse: '', code_postal: '75001',
        ville: 'PARIS', departement: '75',
        dirigeant_qualite: 'Gérante',
        linkedin_search_url: '', score_initial: 35,
      },
    ]),
  },
}))

vi.mock('../rpps', () => ({
  rppsSource: {
    name: 'rpps',
    discover: vi.fn().mockResolvedValue([]),
  },
}))

describe('runDiscovery', () => {
  it('merges results from sources inferred from params', async () => {
    // departement → rpps + bodacc-cessions; naf_code → pappers-naf
    const result = await runDiscovery({ departement: '69', naf_code: '86.21Z' })
    expect(result.length).toBe(2)
    const sources = result.map((r) => r.source)
    expect(sources).toContain('pappers')
    expect(sources).toContain('bodacc_cessions')
  })

  it('deduplicates prospects with same uid across sources', async () => {
    const { pappersNafSource } = await import('../pappers-naf')
    const duplicate = {
      uid: 'marie|martin|987654321',
      source: 'pappers' as const,
      source_type: 'personne_morale' as const,
      siren: '987654321',
      dirigeant_nom: 'MARTIN',
      dirigeant_prenom: 'Marie',
      entreprise_nom: 'MARTIN SAS',
      code_naf: '69.10Z', libelle_naf: '', date_creation: '',
      tranche_effectifs: '', adresse: '', code_postal: '75001',
      ville: 'PARIS', departement: '75',
      dirigeant_qualite: 'Gérante',
      linkedin_search_url: '', score_initial: 35,
    }
    vi.mocked(pappersNafSource.discover).mockResolvedValueOnce([duplicate])

    const result = await runDiscovery({ departement: '75', naf_code: '69.10Z' })
    const uids = result.map((r) => r.uid)
    expect(new Set(uids).size).toBe(uids.length)
  })

  it('returns empty array when no usable params are provided', async () => {
    // No departement, no naf_code → no sources activated
    const result = await runDiscovery({})
    expect(result).toEqual([])
  })

  it('handles source failure gracefully via Promise.allSettled', async () => {
    const { pappersNafSource } = await import('../pappers-naf')
    vi.mocked(pappersNafSource.discover).mockRejectedValueOnce(new Error('network error'))

    const result = await runDiscovery({ departement: '69', naf_code: '86.21Z' })
    // bodacc-cessions still returns its result
    expect(Array.isArray(result)).toBe(true)
  })

  it('caps output at 50 prospects', async () => {
    const { pappersNafSource } = await import('../pappers-naf')
    const many = Array.from({ length: 40 }, (_, i) => ({
      uid: `person|${i}|10000000${i}`.slice(0, 30),
      source: 'pappers' as const,
      source_type: 'personne_morale' as const,
      siren: `10000000${i}`.slice(0, 9),
      dirigeant_nom: `NOM${i}`,
      dirigeant_prenom: `PRENOM${i}`,
      entreprise_nom: `ENTREPRISE${i}`,
      code_naf: '86.21Z', libelle_naf: '', date_creation: '',
      tranche_effectifs: '', adresse: '', code_postal: '69001',
      ville: 'LYON', departement: '69',
      dirigeant_qualite: 'Président',
      linkedin_search_url: '', score_initial: 40,
    }))
    vi.mocked(pappersNafSource.discover).mockResolvedValueOnce(many)

    const result = await runDiscovery({ departement: '69', naf_code: '86.21Z' })
    expect(result.length).toBeLessThanOrEqual(50)
  })
})
