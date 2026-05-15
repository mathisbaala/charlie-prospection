import { describe, it, expect } from 'vitest'
import {
  analyzePersonalPortfolio,
  categorizeEntity,
  summarizePortfolio,
} from '../personal-portfolio'
import type { PappersPersonne } from '@/lib/data-sources/pappers'

type Entreprise = NonNullable<PappersPersonne['entreprises']>[number]

function ent(overrides: Partial<Entreprise> & { siren: string }): Entreprise {
  return {
    siren: overrides.siren,
    nom_entreprise: overrides.nom_entreprise ?? 'ENTREPRISE TEST',
    code_naf: overrides.code_naf,
    libelle_code_naf: overrides.libelle_code_naf,
    date_creation: overrides.date_creation,
    siege: overrides.siege,
  }
}

describe('categorizeEntity — heuristiques', () => {
  it('SCI par NAF 6820A (location immo résidentiel)', () => {
    expect(
      categorizeEntity({ siren: '1', code_naf: '6820A', nom_entreprise: 'X' }),
    ).toBe('sci')
  })

  it('SCI par préfixe nom "SCI "', () => {
    expect(
      categorizeEntity({ siren: '1', nom_entreprise: 'SCI DU MOULIN', code_naf: '6810Z' }),
    ).toBe('sci')
  })

  it('SCCV (construction-vente) — distinct de SCI', () => {
    expect(
      categorizeEntity({ siren: '1', nom_entreprise: 'SCCV LES JARDINS' }),
    ).toBe('sccv')
  })

  it('Holding par NAF 6420Z', () => {
    expect(
      categorizeEntity({ siren: '1', code_naf: '6420Z', nom_entreprise: 'X' }),
    ).toBe('holding')
  })

  it('Holding par nom "HOLDING"', () => {
    expect(
      categorizeEntity({ siren: '1', nom_entreprise: 'DURAND HOLDING', code_naf: '7022Z' }),
    ).toBe('holding')
  })

  it('Holding par nom "PATRIMOINE"', () => {
    expect(
      categorizeEntity({ siren: '1', nom_entreprise: 'PATRIMOINE FAMILIAL', code_naf: '7022Z' }),
    ).toBe('holding')
  })

  it('Principale écrase tout', () => {
    expect(
      categorizeEntity({
        siren: '1',
        nom_entreprise: 'SCI DU MOULIN',
        code_naf: '6820A',
        isPrincipale: true,
      }),
    ).toBe('principale')
  })

  it('Société active opérationnelle par défaut', () => {
    expect(
      categorizeEntity({ siren: '1', nom_entreprise: 'ACME TECH', code_naf: '6201Z' }),
    ).toBe('societe_active')
  })

  it('Autre quand pas de NAF + nom générique', () => {
    expect(categorizeEntity({ siren: '1', nom_entreprise: 'X' })).toBe('autre')
  })

  it('Insensible à la casse + accents', () => {
    expect(
      categorizeEntity({ siren: '1', nom_entreprise: 'sci des Lilas', code_naf: '6810Z' }),
    ).toBe('sci')
  })
})

describe('analyzePersonalPortfolio', () => {
  it('retourne EMPTY si entreprises vide', () => {
    expect(analyzePersonalPortfolio([], 'main-1').total_entites).toBe(0)
    expect(analyzePersonalPortfolio(undefined, 'main-1').niveau_structuration).toBe('none')
  })

  it('détecte une seule entité = none', () => {
    const p = analyzePersonalPortfolio(
      [ent({ siren: 'main-1', nom_entreprise: 'CABINET DURAND', code_naf: '6920Z' })],
      'main-1',
    )
    expect(p.total_entites).toBe(1)
    expect(p.niveau_structuration).toBe('none')
    expect(p.nb_sci).toBe(0)
  })

  it('détecte un patrimoine "simple" (plusieurs sociétés, pas de SCI/holding)', () => {
    const p = analyzePersonalPortfolio(
      [
        ent({ siren: 'main-1', nom_entreprise: 'CABINET DURAND', code_naf: '6920Z' }),
        ent({ siren: 'a-2', nom_entreprise: 'AUTRE ACTIVITE', code_naf: '7022Z' }),
      ],
      'main-1',
    )
    expect(p.total_entites).toBe(2)
    expect(p.nb_societes_actives).toBe(1)
    expect(p.niveau_structuration).toBe('simple')
  })

  it('détecte "structuré" dès qu\'une SCI ou holding apparaît', () => {
    const p = analyzePersonalPortfolio(
      [
        ent({ siren: 'main-1', nom_entreprise: 'CABINET DURAND', code_naf: '6920Z' }),
        ent({ siren: 'sci-1', nom_entreprise: 'SCI DU MOULIN', code_naf: '6820A' }),
      ],
      'main-1',
    )
    expect(p.nb_sci).toBe(1)
    expect(p.niveau_structuration).toBe('structuré')
  })

  it('détecte "sophistiqué" quand SCI + holding + société active coexistent', () => {
    const p = analyzePersonalPortfolio(
      [
        ent({ siren: 'main-1', nom_entreprise: 'CABINET DURAND', code_naf: '6920Z' }),
        ent({ siren: 'h-2', nom_entreprise: 'DURAND HOLDING', code_naf: '6420Z' }),
        ent({ siren: 'sci-3', nom_entreprise: 'SCI DURAND', code_naf: '6820A' }),
        ent({ siren: 'a-4', nom_entreprise: 'AUTRE ACTIV', code_naf: '7022Z' }),
      ],
      'main-1',
    )
    expect(p.nb_sci).toBe(1)
    expect(p.nb_holding).toBe(1)
    expect(p.nb_societes_actives).toBe(1)
    expect(p.niveau_structuration).toBe('sophistiqué')
  })

  it('dédup par SIREN si Pappers renvoie le même 2 fois', () => {
    const p = analyzePersonalPortfolio(
      [
        ent({ siren: 'main-1' }),
        ent({ siren: 'main-1' }), // dupe
        ent({ siren: 'sci-2', nom_entreprise: 'SCI X', code_naf: '6810Z' }),
      ],
      'main-1',
    )
    expect(p.total_entites).toBe(2)
  })

  it('classement : principale > holding > sci > active > autre', () => {
    const p = analyzePersonalPortfolio(
      [
        ent({ siren: 'a-3', nom_entreprise: 'AUTRE ACTIV', code_naf: '7022Z' }),
        ent({ siren: 'sci-2', nom_entreprise: 'SCI X', code_naf: '6810Z' }),
        ent({ siren: 'main-1', nom_entreprise: 'PRINCIPAL', code_naf: '6920Z' }),
        ent({ siren: 'h-4', nom_entreprise: 'X HOLDING', code_naf: '6420Z' }),
      ],
      'main-1',
    )
    const categories = p.entites.map(e => e.category)
    expect(categories[0]).toBe('principale')
    expect(categories[1]).toBe('holding')
    expect(categories[2]).toBe('sci')
    expect(categories[3]).toBe('societe_active')
  })

  it('compte plusieurs SCI cumulées', () => {
    const p = analyzePersonalPortfolio(
      [
        ent({ siren: 'main-1', code_naf: '6920Z' }),
        ent({ siren: 'sci-1', nom_entreprise: 'SCI DU MOULIN', code_naf: '6820A' }),
        ent({ siren: 'sci-2', nom_entreprise: 'SCI DES LILAS', code_naf: '6810Z' }),
        ent({ siren: 'sci-3', nom_entreprise: 'SCI BUREAUX PARIS', code_naf: '6820B' }),
      ],
      'main-1',
    )
    expect(p.nb_sci).toBe(3)
  })

  it('skip les entreprises sans siren', () => {
    const p = analyzePersonalPortfolio(
      [
        ent({ siren: 'main-1' }),
        // @ts-expect-error simuler Pappers qui renvoie un objet partiel
        { nom_entreprise: 'BROKEN', code_naf: '6820A' },
      ],
      'main-1',
    )
    expect(p.total_entites).toBe(1)
  })
})

describe('summarizePortfolio', () => {
  it('résumé compact "sophistiqué"', () => {
    const portfolio = analyzePersonalPortfolio(
      [
        ent({ siren: 'main-1', code_naf: '6920Z' }),
        ent({ siren: 'h', nom_entreprise: 'X HOLDING', code_naf: '6420Z' }),
        ent({ siren: 's1', nom_entreprise: 'SCI A', code_naf: '6820A' }),
        ent({ siren: 's2', nom_entreprise: 'SCI B', code_naf: '6820A' }),
        ent({ siren: 'a', nom_entreprise: 'AUTRE', code_naf: '7022Z' }),
      ],
      'main-1',
    )
    const s = summarizePortfolio(portfolio)
    expect(s).toContain('5 entités')
    expect(s).toContain('2 SCI')
    expect(s).toContain('1 holding')
    expect(s).toContain('sophistiqué')
  })

  it('résumé "1 entité" → none explicite', () => {
    const portfolio = analyzePersonalPortfolio(
      [ent({ siren: 'main-1', code_naf: '6920Z' })],
      'main-1',
    )
    expect(summarizePortfolio(portfolio)).toContain('Une seule entité')
  })
})
