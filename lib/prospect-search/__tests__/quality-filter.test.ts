import { describe, it, expect } from 'vitest'
import { assessProspectQuality, aggregateDropReasons } from '../quality-filter'
import type { ProspectEnrichmentData } from '@/lib/types'

const NOW_YEAR = new Date().getFullYear()

describe('assessProspectQuality — defaults', () => {
  it('keeps a healthy prospect with recent finances + active', () => {
    const enrichment: ProspectEnrichmentData = {
      finances: [
        { annee: NOW_YEAR - 1, chiffre_affaires: 5_000_000, effectif: 25 },
        { annee: NOW_YEAR - 2, chiffre_affaires: 4_500_000, effectif: 22 },
      ],
      nb_etablissements: 1,
      procedure_collective_en_cours: false,
    }
    const result = assessProspectQuality(enrichment)
    expect(result.drop).toBe(false)
    expect(result.reasons).toEqual([])
  })

  it('drops if procédure collective en cours (par défaut)', () => {
    const enrichment: ProspectEnrichmentData = {
      finances: [{ annee: NOW_YEAR - 1, chiffre_affaires: 1_000_000 }],
      nb_etablissements: 1,
      procedure_collective_en_cours: true,
    }
    const result = assessProspectQuality(enrichment)
    expect(result.drop).toBe(true)
    expect(result.reasons[0]).toContain('Procédure collective')
  })

  it('drops coquille vide (0 établissement + 0 finance)', () => {
    const enrichment: ProspectEnrichmentData = {
      finances: [],
      nb_etablissements: 0,
    }
    const result = assessProspectQuality(enrichment)
    expect(result.drop).toBe(true)
    expect(result.reasons[0]).toContain('Coquille vide')
  })

  it('drops si aucune donnée Pappers (pas de NAF + pas de finance + pas d\'établissement)', () => {
    const enrichment: ProspectEnrichmentData = {
      finances: [],
    }
    const result = assessProspectQuality(enrichment)
    expect(result.drop).toBe(true)
    expect(result.reasons[0]).toContain('Aucune donnée Pappers')
  })

  it('NE drop PAS si pas de finance mais nb_etablissements > 0 et NAF présent (boîte récente)', () => {
    const enrichment: ProspectEnrichmentData = {
      finances: [],
      nb_etablissements: 1,
      code_naf: '6201Z',
    }
    const result = assessProspectQuality(enrichment)
    expect(result.drop).toBe(false)
  })

  it('drops dormante (dernière finance > 3 ans)', () => {
    const enrichment: ProspectEnrichmentData = {
      finances: [{ annee: NOW_YEAR - 5, chiffre_affaires: 1_000_000 }],
      nb_etablissements: 1,
    }
    const result = assessProspectQuality(enrichment)
    expect(result.drop).toBe(true)
    expect(result.reasons[0]).toContain('Dormante')
    expect(result.reasons[0]).toContain(String(NOW_YEAR - 5))
  })

  it('NE drop PAS si dernière finance < seuil dormant', () => {
    const enrichment: ProspectEnrichmentData = {
      finances: [{ annee: NOW_YEAR - 2, chiffre_affaires: 1_000_000 }],
      nb_etablissements: 1,
    }
    const result = assessProspectQuality(enrichment)
    expect(result.drop).toBe(false)
  })

  it('latestFinance trouve bien la plus récente même si non triées', () => {
    const enrichment: ProspectEnrichmentData = {
      finances: [
        { annee: NOW_YEAR - 5, chiffre_affaires: 1_000_000 },
        { annee: NOW_YEAR - 1, chiffre_affaires: 1_500_000 }, // la plus récente
        { annee: NOW_YEAR - 3, chiffre_affaires: 1_200_000 },
      ],
      nb_etablissements: 1,
    }
    // Bien que la première soit ancienne, la plus récente est NOW-1 → pas dormante
    const result = assessProspectQuality(enrichment)
    expect(result.drop).toBe(false)
  })
})

describe('assessProspectQuality — options', () => {
  it('peut désactiver excludeFailing', () => {
    const enrichment: ProspectEnrichmentData = {
      finances: [{ annee: NOW_YEAR - 1, chiffre_affaires: 1_000_000 }],
      nb_etablissements: 1,
      procedure_collective_en_cours: true,
    }
    const result = assessProspectQuality(enrichment, { excludeFailing: false })
    expect(result.drop).toBe(false)
  })

  it('peut désactiver excludeDormant', () => {
    const enrichment: ProspectEnrichmentData = {
      finances: [{ annee: NOW_YEAR - 8, chiffre_affaires: 1_000_000 }],
      nb_etablissements: 1,
    }
    const result = assessProspectQuality(enrichment, { excludeDormant: false })
    expect(result.drop).toBe(false)
  })

  it('drops micro quand excludeMicro=true et CA + effectif tous les deux faibles', () => {
    const enrichment: ProspectEnrichmentData = {
      finances: [{ annee: NOW_YEAR - 1, chiffre_affaires: 80_000, effectif: 1 }],
      nb_etablissements: 1,
    }
    const result = assessProspectQuality(enrichment, { excludeMicro: true })
    expect(result.drop).toBe(true)
    expect(result.reasons[0]).toContain('Micro')
  })

  it('NE drop PAS si CA bas mais effectif > seuil (association, start-up early)', () => {
    const enrichment: ProspectEnrichmentData = {
      finances: [{ annee: NOW_YEAR - 1, chiffre_affaires: 80_000, effectif: 15 }],
      nb_etablissements: 1,
    }
    const result = assessProspectQuality(enrichment, { excludeMicro: true })
    expect(result.drop).toBe(false)
  })

  it('NE drop PAS si effectif bas mais CA > seuil (consultant solo lucratif)', () => {
    const enrichment: ProspectEnrichmentData = {
      finances: [{ annee: NOW_YEAR - 1, chiffre_affaires: 500_000, effectif: 1 }],
      nb_etablissements: 1,
    }
    const result = assessProspectQuality(enrichment, { excludeMicro: true })
    expect(result.drop).toBe(false)
  })

  it('seuils personnalisés', () => {
    const enrichment: ProspectEnrichmentData = {
      finances: [{ annee: NOW_YEAR - 1, chiffre_affaires: 1_500_000, effectif: 4 }],
      nb_etablissements: 1,
    }
    // Seuil agressif : 2M€ et effectif ≤ 5 → drop
    const result = assessProspectQuality(enrichment, {
      excludeMicro: true,
      microCaThreshold: 2_000_000,
      microEffectifMax: 5,
    })
    expect(result.drop).toBe(true)
  })
})

describe('assessProspectQuality — cumul de raisons', () => {
  it('accumule plusieurs raisons si plusieurs critères matchent', () => {
    const enrichment: ProspectEnrichmentData = {
      finances: [{ annee: NOW_YEAR - 8, chiffre_affaires: 1_000_000 }],
      nb_etablissements: 1,
      procedure_collective_en_cours: true,
    }
    const result = assessProspectQuality(enrichment)
    expect(result.drop).toBe(true)
    expect(result.reasons.length).toBeGreaterThanOrEqual(2)
    expect(result.reasons.some((r) => r.includes('Procédure collective'))).toBe(true)
    expect(result.reasons.some((r) => r.includes('Dormante'))).toBe(true)
  })
})

describe('aggregateDropReasons', () => {
  it('agrège par raison en strippant les détails parenthésés', () => {
    const counts = aggregateDropReasons([
      { drop: true, reasons: ['Dormante (dernière finance 2020)'] },
      { drop: true, reasons: ['Dormante (dernière finance 2019)'] },
      { drop: true, reasons: ['Procédure collective en cours'] },
      { drop: false, reasons: [] }, // ignored
      { drop: true, reasons: ['Procédure collective en cours', 'Dormante (dernière finance 2018)'] },
    ])
    expect(counts['Dormante']).toBe(3)
    expect(counts['Procédure collective en cours']).toBe(2)
  })

  it('retourne un objet vide quand rien à agréger', () => {
    expect(aggregateDropReasons([])).toEqual({})
    expect(aggregateDropReasons([{ drop: false, reasons: [] }])).toEqual({})
    expect(aggregateDropReasons([null])).toEqual({})
  })
})
