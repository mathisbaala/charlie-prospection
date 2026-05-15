import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  applyStrictBoost,
  canonicalPersonKey,
  parseEffectifTranche,
  _internals,
  searchProspects,
  type RawProspect,
} from '../engine'
import type { ParsedIcpCriteria, StrictFilters } from '@/lib/types'

// Mock data sources to keep tests hermetic (no network).
vi.mock('@/lib/data-sources/pappers', () => ({
  searchEntreprises: vi.fn(async () => ({ resultats: [], total: 0 })),
  getEntrepriseRepresentants: vi.fn(async () => []),
  searchPersonnes: vi.fn(async () => ({ resultats: [], total: 0 })),
}))
vi.mock('@/lib/data-sources/annuaire-entreprises', () => ({
  searchEntreprises: vi.fn(async () => ({ results: [], total_results: 0 })),
}))

import * as pappers from '@/lib/data-sources/pappers'
import * as ae from '@/lib/data-sources/annuaire-entreprises'

const baseCriteria: ParsedIcpCriteria = {
  roles: [],
  sectors: [],
  locations: [],
  keywords: [],
  signal_priorities: [],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('canonicalPersonKey', () => {
  it('normalizes diacritics and case', () => {
    expect(canonicalPersonKey('Jean', 'Müller', '552')).toEqual(
      canonicalPersonKey('JEAN', 'MULLER', '552'),
    )
  })

  it('uses siren as tiebreaker — same name, different sirens = different keys', () => {
    const a = canonicalPersonKey('Jean', 'Durand', '111')
    const b = canonicalPersonKey('Jean', 'Durand', '222')
    expect(a).not.toBe(b)
  })

  it('handles missing siren without throwing', () => {
    expect(canonicalPersonKey('Jean', 'Durand')).toBe('jean|durand|—')
  })

  it('collapses whitespace', () => {
    expect(canonicalPersonKey('  Jean  ', 'Durand ', '1'))
      .toBe(canonicalPersonKey('Jean', 'Durand', '1'))
  })
})

describe('parseEffectifTranche', () => {
  it('decodes AE code 11 → 10-19', () => {
    expect(parseEffectifTranche('11')).toEqual({ min: 10, max: 19 })
  })
  it('decodes AE code 32 → 250-499', () => {
    expect(parseEffectifTranche('32')).toEqual({ min: 250, max: 499 })
  })
  it('parses Pappers range string', () => {
    expect(parseEffectifTranche('10 à 19 salariés')).toEqual({ min: 10, max: 19 })
  })
  it('returns null for unparseable input', () => {
    expect(parseEffectifTranche('')).toBeNull()
    expect(parseEffectifTranche('inconnu')).toBeNull()
  })
})

describe('shouldExcludeFromLiberal', () => {
  const { shouldExcludeFromLiberal } = _internals

  it('keeps a small liberal cabinet (libéral target, small)', () => {
    expect(shouldExcludeFromLiberal({
      codeNaf: '86.21Z',
      entrepriseNom: 'CABINET DR DURAND',
      trancheEffectif: '01',
    })).toBe(false)
  })

  it('excludes institutional entities targeting libéraux', () => {
    expect(shouldExcludeFromLiberal({
      codeNaf: '86.10Z',
      entrepriseNom: 'CENTRE HOSPITALIER UNIVERSITAIRE DE LYON',
    })).toBe(true)
  })

  it('excludes federations & syndicats', () => {
    expect(shouldExcludeFromLiberal({
      codeNaf: '69.10Z',
      entrepriseNom: 'FEDERATION NATIONALE DES NOTAIRES',
    })).toBe(true)
  })

  it('excludes large companies (AE tranche ≥ 41) on liberal NAF', () => {
    expect(shouldExcludeFromLiberal({
      codeNaf: '86.21Z',
      entrepriseNom: 'GROUPE MEDICAL XL',
      trancheEffectif: '41',
    })).toBe(true)
  })

  it('excludes ETI/GE categories', () => {
    expect(shouldExcludeFromLiberal({
      codeNaf: '69.10Z',
      entrepriseNom: 'CABINET XYZ',
      categorieEntreprise: 'ETI',
    })).toBe(true)
  })

  it('excludes companies with effectif_max > 50 on liberal NAF', () => {
    expect(shouldExcludeFromLiberal({
      codeNaf: '86.21Z',
      entrepriseNom: 'CABINET XYZ',
      effectifMax: 120,
    })).toBe(true)
  })

  it('does NOT exclude large companies if NAF is not libéral', () => {
    expect(shouldExcludeFromLiberal({
      codeNaf: '62.01Z',
      entrepriseNom: 'STARTUP SAAS',
      trancheEffectif: '42',
    })).toBe(false)
  })
})

describe('passesHardFilters', () => {
  const { passesHardFilters } = _internals

  function fakeProspect(overrides: Partial<RawProspect> = {}): RawProspect {
    return {
      uid: 'x',
      source: 'pappers',
      source_type: 'personne_morale',
      entreprise_nom: 'X',
      siren: '1',
      code_naf: '',
      libelle_naf: '',
      date_creation: '',
      tranche_effectifs: '',
      adresse: '',
      code_postal: '',
      ville: '',
      departement: '',
      dirigeant_nom: 'X',
      dirigeant_prenom: 'X',
      dirigeant_qualite: '',
      linkedin_search_url: '',
      score_initial: 50,
      ...overrides,
    }
  }

  it('passes when no thresholds are set', () => {
    expect(passesHardFilters(fakeProspect(), baseCriteria)).toBe(true)
  })

  it('filters by effectif_min when tranche known', () => {
    const p = fakeProspect({ tranche_effectifs: '01' }) // 1-2
    expect(passesHardFilters(p, { ...baseCriteria, effectif_min: 10 })).toBe(false)
  })

  it('filters by effectif_max when tranche known', () => {
    const p = fakeProspect({ tranche_effectifs: '32' }) // 250-499
    expect(passesHardFilters(p, { ...baseCriteria, effectif_max: 50 })).toBe(false)
  })

  it('tolerates unknown effectif when threshold set (no false negatives)', () => {
    const p = fakeProspect({ tranche_effectifs: '' })
    expect(passesHardFilters(p, { ...baseCriteria, effectif_min: 10 })).toBe(true)
  })

  it('filters by age_min', () => {
    const p = fakeProspect({ dirigeant_annee_naissance: new Date().getFullYear() - 25 })
    expect(passesHardFilters(p, { ...baseCriteria, age_min: 40 })).toBe(false)
  })

  it('filters by age_max', () => {
    const p = fakeProspect({ dirigeant_annee_naissance: new Date().getFullYear() - 70 })
    expect(passesHardFilters(p, { ...baseCriteria, age_max: 60 })).toBe(false)
  })

  it('passes within age range', () => {
    const p = fakeProspect({ dirigeant_annee_naissance: new Date().getFullYear() - 50 })
    expect(passesHardFilters(p, { ...baseCriteria, age_min: 40, age_max: 60 })).toBe(true)
  })
})

describe('searchProspects — routing', () => {
  it('personne_physique routes to searchPersonnes', async () => {
    vi.mocked(pappers.searchPersonnes).mockResolvedValueOnce({
      resultats: [
        {
          nom: 'DURAND',
          prenom: 'Jean',
          qualite: 'médecin',
          entreprises: [{
            siren: '123456789',
            nom_entreprise: 'CABINET DURAND',
            code_naf: '86.21Z',
            libelle_code_naf: 'Médecin généraliste',
            date_creation: '2010-01-01',
            siege: { code_postal: '69001', ville: 'Lyon', departement: '69' },
          }],
        },
      ],
      total: 1,
    })

    const results = await searchProspects(
      { ...baseCriteria, target_type: 'personne_physique', roles: ['médecin'] },
      { limit: 5 },
    )

    expect(pappers.searchPersonnes).toHaveBeenCalled()
    expect(pappers.searchEntreprises).not.toHaveBeenCalled()
    expect(ae.searchEntreprises).not.toHaveBeenCalled()
    expect(results).toHaveLength(1)
    expect(results[0].source_type).toBe('personne_physique')
    expect(results[0].dirigeant_nom).toBe('DURAND')
  })

  it('personne_morale (default) routes to society flow', async () => {
    await searchProspects(
      { ...baseCriteria, target_type: 'personne_morale', roles: ['avocat'] },
      { limit: 5 },
    )
    expect(pappers.searchPersonnes).not.toHaveBeenCalled()
    expect(pappers.searchEntreprises).toHaveBeenCalled()
    expect(ae.searchEntreprises).toHaveBeenCalled()
  })

  it('both routes to all three flows', async () => {
    await searchProspects(
      { ...baseCriteria, target_type: 'both', roles: ['avocat'] },
      { limit: 6 },
    )
    expect(pappers.searchPersonnes).toHaveBeenCalled()
    expect(pappers.searchEntreprises).toHaveBeenCalled()
    expect(ae.searchEntreprises).toHaveBeenCalled()
  })
})

describe('searchProspects — sectors fallback', () => {
  it('uses sectors to derive NAF codes when roles is empty (regression: silent bug)', async () => {
    vi.mocked(pappers.searchEntreprises).mockResolvedValue({ resultats: [], total: 0 })
    vi.mocked(ae.searchEntreprises).mockResolvedValue({ results: [], total_results: 0 })

    await searchProspects(
      { ...baseCriteria, target_type: 'personne_morale', roles: [], sectors: ['santé'] },
      { limit: 5 },
    )

    // Both fetchers should have been called with a code_naf derived from 'santé'.
    const pappersCalls = vi.mocked(pappers.searchEntreprises).mock.calls
    const nafsRequested = pappersCalls.map(c => c[0]?.code_naf).filter(Boolean)
    expect(nafsRequested.length).toBeGreaterThan(0)
  })
})

describe('searchProspects — cross-source dedup', () => {
  it('dedupes the same person returned by Pappers and AE via canonical key', async () => {
    vi.mocked(pappers.searchEntreprises).mockResolvedValueOnce({
      resultats: [{
        siren: '999888777',
        nom_entreprise: 'CABINET DURAND',
        code_naf: '69.10Z',
        libelle_code_naf: 'Avocat',
        date_creation: '2010-01-01',
        nb_dirigeants_total: 1,
        siege: { code_postal: '75001', ville: 'Paris', departement: '75' },
      }],
      total: 1,
    })
    vi.mocked(pappers.getEntrepriseRepresentants).mockResolvedValueOnce([{
      nom: 'DURAND',
      prenom: 'Jean',
      qualite: 'avocat',
      personne_morale: false,
    }])
    vi.mocked(ae.searchEntreprises).mockResolvedValueOnce({
      results: [{
        siren: '999888777',
        nom_complet: 'CABINET DURAND',
        activite_principale: '69.10Z',
        libelle_activite_principale: 'Avocat',
        date_creation: '2010-01-01',
        siege: { code_postal: '75001', commune: 'PARIS', libelle_commune: 'Paris', departement: '75' },
        dirigeants: [{ nom: 'DURAND', prenoms: 'Jean', qualite: 'avocat' }],
      }],
      total_results: 1,
    })

    const results = await searchProspects(
      { ...baseCriteria, target_type: 'personne_morale', roles: ['avocat'], locations: ['Paris'] },
      { limit: 10 },
    )

    // Same person from two sources → 1 entry
    expect(results.filter(r => r.dirigeant_nom === 'DURAND')).toHaveLength(1)
  })
})

describe('searchProspects — department filtering', () => {
  it('excludes a Pappers result whose siege is outside the requested dept', async () => {
    vi.mocked(pappers.searchEntreprises).mockResolvedValueOnce({
      resultats: [{
        siren: '111',
        nom_entreprise: 'X',
        code_naf: '69.10Z',
        date_creation: '2010-01-01',
        nb_dirigeants_total: 1,
        siege: { code_postal: '13001', ville: 'Marseille', departement: '13' },
      }],
      total: 1,
    })

    const results = await searchProspects(
      // geo_strict: true → 75 only, no adjacency
      { ...baseCriteria, target_type: 'personne_morale', roles: ['avocat'], locations: ['Paris'], geo_strict: true },
      { limit: 10 },
    )
    expect(results).toHaveLength(0)
  })

  it('with geo_strict=false (default), adjacent depts are accepted', async () => {
    // Lyon (69) → adjacents include 01 (Ain), 38 (Isère)
    vi.mocked(pappers.searchEntreprises).mockResolvedValueOnce({
      resultats: [{
        siren: '222',
        nom_entreprise: 'CABINET ISERE',
        code_naf: '69.10Z',
        date_creation: '2010-01-01',
        nb_dirigeants_total: 1,
        siege: { code_postal: '38000', ville: 'Grenoble', departement: '38' },
      }],
      total: 1,
    })
    vi.mocked(pappers.getEntrepriseRepresentants).mockResolvedValueOnce([{
      nom: 'BARTHE', prenom: 'Lucie', qualite: 'avocat', personne_morale: false,
    }])

    const results = await searchProspects(
      { ...baseCriteria, target_type: 'personne_morale', roles: ['avocat'], locations: ['Lyon'] },
      { limit: 10 },
    )
    // Should accept the Isère prospect (adjacent to Rhône)
    expect(results.some(r => r.departement === '38')).toBe(true)
  })
})

describe('applyStrictBoost', () => {
  function p(overrides: Partial<RawProspect> = {}): RawProspect {
    return {
      uid: 'x',
      source: 'pappers',
      source_type: 'personne_morale',
      entreprise_nom: 'ACME',
      siren: '123456789',
      code_naf: '8621Z',
      libelle_naf: 'Pratique médicale générale',
      date_creation: '2018-01-01',
      tranche_effectifs: '21',
      adresse: '',
      code_postal: '75001',
      ville: 'Paris',
      departement: '75',
      dirigeant_nom: 'Durand',
      dirigeant_prenom: 'Jean',
      dirigeant_qualite: 'Directeur général',
      dirigeant_annee_naissance: 1980,
      linkedin_search_url: '',
      score_initial: 50,
      ...overrides,
    }
  }

  it('returns prospects unchanged when no strict filters set', () => {
    const out = applyStrictBoost([p()], { roles: [], sectors: [], locations: [], keywords: [], signal_priorities: [] }, {})
    expect(out[0].score_initial).toBe(50)
  })

  it('boosts when strict role matches dirigeant_qualite (substring)', () => {
    const criteria: ParsedIcpCriteria = { roles: ['directeur'], sectors: [], locations: [], keywords: [], signal_priorities: [] }
    const strict: StrictFilters = { roles: true }
    const out = applyStrictBoost([p()], criteria, strict)
    expect(out[0].score_initial).toBeGreaterThan(50)
    expect(out[0].score_initial).toBe(57) // 50 * 1.15 → 57.4999… (float) → 57
  })

  it('does not boost when strict flag is set but role does not match', () => {
    const criteria: ParsedIcpCriteria = { roles: ['avocat'], sectors: [], locations: [], keywords: [], signal_priorities: [] }
    const strict: StrictFilters = { roles: true }
    const out = applyStrictBoost([p()], criteria, strict)
    expect(out[0].score_initial).toBe(50)
  })

  it('boosts when strict sector matches libelle_naf', () => {
    const criteria: ParsedIcpCriteria = { roles: [], sectors: ['Pratique médicale'], locations: [], keywords: [], signal_priorities: [] }
    const out = applyStrictBoost([p()], criteria, { sectors: true })
    expect(out[0].score_initial).toBe(57)
  })

  it('boosts when strict target_type matches', () => {
    const criteria: ParsedIcpCriteria = {
      target_type: 'personne_morale',
      roles: [], sectors: [], locations: [], keywords: [], signal_priorities: [],
    }
    const out = applyStrictBoost([p()], criteria, { target_type: true })
    expect(out[0].score_initial).toBe(57)
  })

  it('boosts target_type=both for both source types', () => {
    const criteria: ParsedIcpCriteria = {
      target_type: 'both',
      roles: [], sectors: [], locations: [], keywords: [], signal_priorities: [],
    }
    const morale = p({ source_type: 'personne_morale', score_initial: 40 })
    const physique = p({ source_type: 'personne_physique', score_initial: 40, uid: 'y' })
    const out = applyStrictBoost([morale, physique], criteria, { target_type: true })
    expect(out[0].score_initial).toBe(46) // 40 * 1.15
    expect(out[1].score_initial).toBe(46)
  })

  it('boosts when age strict and age within range', () => {
    // 2026 - 1980 = 46 years
    const criteria: ParsedIcpCriteria = {
      roles: [], sectors: [], locations: [], keywords: [], signal_priorities: [],
      age_min: 40, age_max: 55,
    }
    const out = applyStrictBoost([p()], criteria, { age_min: true })
    expect(out[0].score_initial).toBe(57)
  })

  it('does not boost age when birth year missing', () => {
    const criteria: ParsedIcpCriteria = {
      roles: [], sectors: [], locations: [], keywords: [], signal_priorities: [],
      age_min: 40,
    }
    const out = applyStrictBoost([p({ dirigeant_annee_naissance: undefined })], criteria, { age_min: true })
    expect(out[0].score_initial).toBe(50)
  })

  it('compounds multipliers across multiple strict matches', () => {
    const criteria: ParsedIcpCriteria = {
      target_type: 'personne_morale',
      roles: ['directeur'],
      sectors: ['médicale'],
      locations: [], keywords: [], signal_priorities: [],
    }
    const out = applyStrictBoost([p()], criteria, { target_type: true, roles: true, sectors: true })
    // 50 * 1.15 * 1.15 * 1.15 ≈ 75.96 → 76
    expect(out[0].score_initial).toBe(76)
  })

  it('caps the score at 100 even with multiple matches', () => {
    const criteria: ParsedIcpCriteria = {
      target_type: 'personne_morale',
      roles: ['directeur'],
      sectors: ['médicale'],
      locations: [], keywords: [], signal_priorities: [],
    }
    const out = applyStrictBoost(
      [p({ score_initial: 90 })],
      criteria,
      { target_type: true, roles: true, sectors: true },
    )
    expect(out[0].score_initial).toBe(100)
  })
})
