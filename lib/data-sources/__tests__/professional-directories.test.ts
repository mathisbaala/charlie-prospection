import { describe, it, expect } from 'vitest'
import {
  detectLiberalProfession,
  buildCnbAvocatSearchUrl,
  buildNotairesSearchUrl,
  buildExpertsComptablesSearchUrl,
  buildLiberalDirectoryUrls,
} from '../professional-directories'

describe('detectLiberalProfession', () => {
  it('detects avocat from NAF 69.10Z', () => {
    expect(detectLiberalProfession({ code_naf: '69.10Z' })).toBe('avocat')
  })

  it('detects notaire when qualité mentions it on 69.10Z', () => {
    expect(
      detectLiberalProfession({ code_naf: '69.10Z', dirigeant_qualite: 'Notaire associé' }),
    ).toBe('notaire')
  })

  it('detects expert_comptable from NAF 69.20Z', () => {
    expect(detectLiberalProfession({ code_naf: '69.20Z' })).toBe('expert_comptable')
  })

  it('detects commissaire_aux_comptes from qualité on 69.20Z', () => {
    expect(
      detectLiberalProfession({
        code_naf: '69.20Z',
        dirigeant_qualite: 'Commissaire aux comptes',
      }),
    ).toBe('commissaire_aux_comptes')
  })

  it('detects avocat via free text when NAF is missing', () => {
    expect(detectLiberalProfession({ dirigeant_qualite: 'Avocat au Barreau de Paris' })).toBe('avocat')
  })

  it('detects expert_comptable via libellé NAF', () => {
    expect(
      detectLiberalProfession({ libelle_naf: 'Activités des experts-comptables' }),
    ).toBe('expert_comptable')
  })

  it('returns null for generic services', () => {
    expect(
      detectLiberalProfession({ code_naf: '70.22Z', dirigeant_qualite: 'Consultant' }),
    ).toBeNull()
  })

  it('handles NAF without the dot separator', () => {
    expect(detectLiberalProfession({ code_naf: '6910Z' })).toBe('avocat')
  })
})

describe('buildCnbAvocatSearchUrl', () => {
  it('combines first and last name in q', () => {
    const url = buildCnbAvocatSearchUrl({ nom: 'Durand', prenom: 'Marc' })
    expect(url).toContain('avocat.fr')
    expect(url).toContain('q=Marc+Durand')
  })

  it('adds localisation when ville is provided', () => {
    const url = buildCnbAvocatSearchUrl({ nom: 'Durand', ville: 'Lyon' })
    expect(url).toContain('localisation=Lyon')
  })

  it('handles accents safely', () => {
    const url = buildCnbAvocatSearchUrl({ nom: 'Béranger', prenom: 'François' })
    expect(url).toMatch(/q=Fran.*B.*ranger/)
  })
})

describe('buildNotairesSearchUrl', () => {
  it('targets notaires.fr annuaire officiel', () => {
    const url = buildNotairesSearchUrl({ nom: 'Lefebvre', prenom: 'Sophie', ville: 'Bordeaux' })
    expect(url).toContain('notaires.fr')
    expect(url).toContain('annuaire-officiel-notaires')
    expect(url).toContain('Sophie+Lefebvre')
    expect(url).toContain('ville=Bordeaux')
  })
})

describe('buildExpertsComptablesSearchUrl', () => {
  it('prefers code_postal over ville for precision', () => {
    const url = buildExpertsComptablesSearchUrl({
      nom: 'Martin',
      prenom: 'Jean',
      ville: 'Paris',
      code_postal: '75008',
    })
    expect(url).toContain('experts-comptables.org')
    expect(url).toContain('codePostal=75008')
    expect(url).not.toContain('ville=')
  })

  it('falls back to slugified ville when no code_postal', () => {
    const url = buildExpertsComptablesSearchUrl({
      nom: 'Martin',
      ville: 'Saint-Étienne',
    })
    expect(url).toContain('ville=saint-etienne')
  })
})

describe('buildLiberalDirectoryUrls — high-level orchestration', () => {
  it('produces avocat_cnb URL for an avocat prospect', () => {
    const urls = buildLiberalDirectoryUrls({
      code_naf: '69.10Z',
      dirigeant_qualite: 'Avocat associé',
      nom: 'Durand',
      prenom: 'Marc',
      ville: 'Paris',
    })
    expect(urls?.detected_profession).toBe('avocat')
    expect(urls?.avocat_cnb).toContain('avocat.fr')
    expect(urls?.notaires).toBeUndefined()
  })

  it('produces notaires URL for a notaire prospect', () => {
    const urls = buildLiberalDirectoryUrls({
      code_naf: '69.10Z',
      dirigeant_qualite: 'Notaire titulaire',
      nom: 'Lefebvre',
      prenom: 'Sophie',
      ville: 'Bordeaux',
    })
    expect(urls?.detected_profession).toBe('notaire')
    expect(urls?.notaires).toContain('notaires.fr')
  })

  it('produces experts_comptables URL for an EC prospect', () => {
    const urls = buildLiberalDirectoryUrls({
      code_naf: '69.20Z',
      nom: 'Martin',
      prenom: 'Jean',
      code_postal: '75008',
    })
    expect(urls?.detected_profession).toBe('expert_comptable')
    expect(urls?.experts_comptables).toContain('experts-comptables.org')
  })

  it('returns null when no liberal profession is detected', () => {
    const urls = buildLiberalDirectoryUrls({
      code_naf: '70.22Z',
      nom: 'Test',
      prenom: 'User',
    })
    expect(urls).toBeNull()
  })

  it('handles commissaire aux comptes by routing to experts_comptables URL', () => {
    const urls = buildLiberalDirectoryUrls({
      code_naf: '69.20Z',
      dirigeant_qualite: 'Commissaire aux comptes',
      nom: 'Bernard',
      prenom: 'Paul',
    })
    expect(urls?.detected_profession).toBe('commissaire_aux_comptes')
    expect(urls?.experts_comptables).toContain('experts-comptables.org')
  })
})
