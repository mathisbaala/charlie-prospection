import { describe, it, expect } from 'vitest'
import { computeFinanceDerivatives, summarizeDerivatives } from '../finance-derivatives'
import type { FinanceYear } from '@/lib/types'

function fy(annee: number, overrides: Partial<FinanceYear> = {}): FinanceYear {
  return { annee, ...overrides }
}

describe('computeFinanceDerivatives — cas vides', () => {
  it('retourne EMPTY pour finances undefined / vide', () => {
    expect(computeFinanceDerivatives(undefined).years_available).toBe(0)
    expect(computeFinanceDerivatives([]).years_available).toBe(0)
    expect(computeFinanceDerivatives([]).ca_trajectory).toBe('unknown')
  })

  it('1 année dispo: pas de growth YoY ni CAGR', () => {
    const d = computeFinanceDerivatives([fy(2025, { chiffre_affaires: 1_000_000 })])
    expect(d.years_available).toBe(1)
    expect(d.ca_growth_yoy).toBe(null)
    expect(d.ca_growth_3y_cagr).toBe(null)
    expect(d.ca_trajectory).toBe('unknown')
    expect(d.latest_year).toBe(2025)
  })
})

describe('computeFinanceDerivatives — CA growth YoY', () => {
  it('croissance positive', () => {
    const d = computeFinanceDerivatives([
      fy(2025, { chiffre_affaires: 1_250_000 }),
      fy(2024, { chiffre_affaires: 1_000_000 }),
    ])
    expect(d.ca_growth_yoy).toBe(25)
  })

  it('décroissance', () => {
    const d = computeFinanceDerivatives([
      fy(2025, { chiffre_affaires: 800_000 }),
      fy(2024, { chiffre_affaires: 1_000_000 }),
    ])
    expect(d.ca_growth_yoy).toBe(-20)
  })

  it('division par zéro → null', () => {
    const d = computeFinanceDerivatives([
      fy(2025, { chiffre_affaires: 1_000_000 }),
      fy(2024, { chiffre_affaires: 0 }),
    ])
    expect(d.ca_growth_yoy).toBe(null)
  })

  it('inversion signe → null (CA passé négatif à positif n\'a pas de sens)', () => {
    const d = computeFinanceDerivatives([
      fy(2025, { chiffre_affaires: 100_000 }),
      fy(2024, { chiffre_affaires: -50_000 }),
    ])
    expect(d.ca_growth_yoy).toBe(null)
  })

  it('finances non triées: la plus récente est utilisée comme "recent"', () => {
    const d = computeFinanceDerivatives([
      fy(2023, { chiffre_affaires: 1_000_000 }),
      fy(2025, { chiffre_affaires: 1_500_000 }), // plus récente
      fy(2024, { chiffre_affaires: 1_200_000 }),
    ])
    // YoY = 2025 vs 2024 = +25%
    expect(d.ca_growth_yoy).toBe(25)
    expect(d.latest_year).toBe(2025)
  })
})

describe('computeFinanceDerivatives — CAGR 3 ans', () => {
  it('calcule CAGR sur la fenêtre disponible', () => {
    const d = computeFinanceDerivatives([
      fy(2025, { chiffre_affaires: 2_000_000 }),
      fy(2024, { chiffre_affaires: 1_600_000 }),
      fy(2023, { chiffre_affaires: 1_300_000 }),
      fy(2022, { chiffre_affaires: 1_000_000 }),
    ])
    // 2025/2022 = 2x sur 3 ans → CAGR ≈ 26%
    expect(d.ca_growth_3y_cagr).not.toBeNull()
    expect(d.ca_growth_3y_cagr!).toBeGreaterThan(25)
    expect(d.ca_growth_3y_cagr!).toBeLessThan(27)
  })

  it('null si moins de 3 ans', () => {
    const d = computeFinanceDerivatives([
      fy(2025, { chiffre_affaires: 1_500_000 }),
      fy(2024, { chiffre_affaires: 1_000_000 }),
    ])
    expect(d.ca_growth_3y_cagr).toBe(null)
  })
})

describe('computeFinanceDerivatives — trajectoire', () => {
  it('classifie growth quand CAGR > 8%', () => {
    const d = computeFinanceDerivatives([
      fy(2025, { chiffre_affaires: 1_500_000 }),
      fy(2024, { chiffre_affaires: 1_300_000 }),
      fy(2023, { chiffre_affaires: 1_100_000 }),
      fy(2022, { chiffre_affaires: 1_000_000 }),
    ])
    expect(d.ca_trajectory).toBe('growth')
  })

  it('classifie decline quand CAGR < -8%', () => {
    const d = computeFinanceDerivatives([
      fy(2025, { chiffre_affaires: 700_000 }),
      fy(2024, { chiffre_affaires: 800_000 }),
      fy(2023, { chiffre_affaires: 900_000 }),
      fy(2022, { chiffre_affaires: 1_000_000 }),
    ])
    expect(d.ca_trajectory).toBe('decline')
  })

  it('classifie stable quand CAGR proche de zéro', () => {
    const d = computeFinanceDerivatives([
      fy(2025, { chiffre_affaires: 1_020_000 }),
      fy(2024, { chiffre_affaires: 1_010_000 }),
      fy(2023, { chiffre_affaires: 1_005_000 }),
      fy(2022, { chiffre_affaires: 1_000_000 }),
    ])
    expect(d.ca_trajectory).toBe('stable')
  })

  it('classifie volatile quand stddev des YoY est élevé', () => {
    // +50% puis -40% puis +60% → très volatil
    const d = computeFinanceDerivatives([
      fy(2025, { chiffre_affaires: 1_440_000 }), // +60% vs 2024
      fy(2024, { chiffre_affaires: 900_000 }), // -40% vs 2023
      fy(2023, { chiffre_affaires: 1_500_000 }), // +50% vs 2022
      fy(2022, { chiffre_affaires: 1_000_000 }),
    ])
    expect(d.ca_trajectory).toBe('volatile')
  })

  it('volatile écrase growth/decline (priorité signal)', () => {
    // Tendance globale positive mais avec un trou marqué
    const d = computeFinanceDerivatives([
      fy(2025, { chiffre_affaires: 2_500_000 }), // +25% vs 2024
      fy(2024, { chiffre_affaires: 2_000_000 }), // -50% vs 2023
      fy(2023, { chiffre_affaires: 4_000_000 }), // +100% vs 2022
      fy(2022, { chiffre_affaires: 2_000_000 }),
    ])
    expect(d.ca_trajectory).toBe('volatile')
  })
})

describe('computeFinanceDerivatives — marge EBITDA', () => {
  it('calcule le delta points entre recent et oldest', () => {
    const d = computeFinanceDerivatives([
      fy(2025, { taux_marge_EBITDA: 18, chiffre_affaires: 1_000_000 }),
      fy(2024, { taux_marge_EBITDA: 15, chiffre_affaires: 900_000 }),
      fy(2023, { taux_marge_EBITDA: 12, chiffre_affaires: 800_000 }),
    ])
    expect(d.marge_ebitda_delta_pts).toBe(6) // 18 - 12
  })

  it('null si une des marges manque', () => {
    const d = computeFinanceDerivatives([
      fy(2025, { taux_marge_EBITDA: 18 }),
      fy(2024, {}),
    ])
    expect(d.marge_ebitda_delta_pts).toBe(null)
  })
})

describe('computeFinanceDerivatives — fonds propres', () => {
  it('croissance fonds propres = proxy d\'enrichissement', () => {
    const d = computeFinanceDerivatives([
      fy(2025, { fonds_propres: 2_000_000 }),
      fy(2024, { fonds_propres: 1_500_000 }),
      fy(2023, { fonds_propres: 1_200_000 }),
      fy(2022, { fonds_propres: 1_000_000 }),
    ])
    expect(d.fonds_propres_growth_pct).toBe(100) // 2M / 1M - 1 = 100%
  })

  it('fallback YoY si pas 3 ans', () => {
    const d = computeFinanceDerivatives([
      fy(2025, { fonds_propres: 1_500_000 }),
      fy(2024, { fonds_propres: 1_000_000 }),
    ])
    expect(d.fonds_propres_growth_pct).toBe(50)
  })
})

describe('computeFinanceDerivatives — debt to equity', () => {
  it('calcule D/E sur le dernier exercice', () => {
    const d = computeFinanceDerivatives([
      fy(2025, { dettes_financieres: 500_000, fonds_propres: 1_000_000 }),
    ])
    expect(d.debt_to_equity).toBe(0.5)
  })

  it('null si fonds propres = 0', () => {
    const d = computeFinanceDerivatives([
      fy(2025, { dettes_financieres: 500_000, fonds_propres: 0 }),
    ])
    expect(d.debt_to_equity).toBe(null)
  })

  it('null si une donnée manque', () => {
    const d = computeFinanceDerivatives([fy(2025, { fonds_propres: 1_000_000 })])
    expect(d.debt_to_equity).toBe(null)
  })

  it('boîte sur-endettée: D/E > 2', () => {
    const d = computeFinanceDerivatives([
      fy(2025, { dettes_financieres: 3_000_000, fonds_propres: 1_000_000 }),
    ])
    expect(d.debt_to_equity).toBe(3)
  })
})

describe('computeFinanceDerivatives — effectif delta', () => {
  it('calcule la variation absolue sur 3 ans', () => {
    const d = computeFinanceDerivatives([
      fy(2025, { effectif: 25 }),
      fy(2024, { effectif: 20 }),
      fy(2023, { effectif: 15 }),
      fy(2022, { effectif: 10 }),
    ])
    expect(d.effectif_delta_3y).toBe(15)
  })

  it('null si effectif missing', () => {
    const d = computeFinanceDerivatives([
      fy(2025, { effectif: null }),
      fy(2024, { effectif: 20 }),
    ])
    expect(d.effectif_delta_3y).toBe(null)
  })
})

describe('summarizeDerivatives', () => {
  it('résumé compact pour cas nominal', () => {
    const d = computeFinanceDerivatives([
      fy(2025, {
        chiffre_affaires: 1_500_000,
        taux_marge_EBITDA: 18,
        fonds_propres: 800_000,
        dettes_financieres: 200_000,
        effectif: 12,
      }),
      fy(2024, {
        chiffre_affaires: 1_200_000,
        taux_marge_EBITDA: 14,
        fonds_propres: 600_000,
        effectif: 9,
      }),
      fy(2023, {
        chiffre_affaires: 1_000_000,
        taux_marge_EBITDA: 10,
        fonds_propres: 400_000,
        effectif: 6,
      }),
    ])
    const summary = summarizeDerivatives(d)
    expect(summary).toContain('CA YoY')
    expect(summary).toContain('marge EBITDA')
    expect(summary).toContain('trajectoire growth')
    expect(summary).toContain('D/E')
  })

  it('résumé minimal quand 0 finance', () => {
    expect(summarizeDerivatives(computeFinanceDerivatives([]))).toBe(
      'Pas de données financières',
    )
  })

  it('inclut un sign + sur les positifs', () => {
    const d = computeFinanceDerivatives([
      fy(2025, { chiffre_affaires: 1_200_000 }),
      fy(2024, { chiffre_affaires: 1_000_000 }),
    ])
    const s = summarizeDerivatives(d)
    expect(s).toContain('+20%')
  })
})
