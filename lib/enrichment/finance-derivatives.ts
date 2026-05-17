import type { FinanceYear } from '@/lib/types'

/**
 * Dérivées calculées sur les 5 années de finances Pappers brutes.
 *
 * Pappers nous donne un snapshot par an (CA, marge, EBITDA, fonds propres,
 * effectif…). Aucune dérivée n'est calculée par défaut. Or pour le scorer
 * patrimoine d'un CGP, "CA = 5M€" est ambigu — 5M€ en croissance de 30%/an
 * vaut 5x plus que 5M€ en déclin de 10%/an.
 *
 * Ce module calcule :
 *   - Taux de croissance CA (YoY + CAGR 3 ans)
 *   - Catégorie de trajectoire (growth / stable / decline / volatile)
 *   - Évolution de la marge EBITDA
 *   - Évolution du résultat
 *   - Évolution des fonds propres (proxy d'enrichissement patrimonial)
 *   - Ratio d'endettement (D/E)
 *   - Effectif growth (proxy de croissance d'activité)
 *
 * Tous les calculs sont robustes aux trous : si une année n'a pas de
 * `chiffre_affaires`, on saute l'année dans le calcul de la pente. Si toutes
 * les années sont manquantes, on retourne `null` partout (le scorer le sait
 * et n'invente rien).
 */

export type Trajectory = 'growth' | 'stable' | 'decline' | 'volatile' | 'unknown'

export interface FinanceDerivatives {
  /** Croissance CA year-over-year sur le dernier exercice (en %).
   *  Ex. CA[n] = 5M€, CA[n-1] = 4M€ → +25.0%. Null si pas calculable. */
  ca_growth_yoy: number | null
  /** Croissance annualisée CAGR sur 3 ans (en %). Plus stable que YoY.
   *  Formule: (CA_recent / CA_3y_avant)^(1/3) - 1. Null si < 3 ans dispo. */
  ca_growth_3y_cagr: number | null
  /** Trajectoire CA sur les années disponibles. Pondérée par CAGR (si dispo)
   *  ou YoY sinon. Volatile = écart-type des YoY > seuil. */
  ca_trajectory: Trajectory
  /** Variation de la marge EBITDA en points entre la dernière année
   *  et la plus ancienne. Positif = expansion, négatif = compression. */
  marge_ebitda_delta_pts: number | null
  /** Variation du résultat net en % YoY. */
  resultat_growth_yoy: number | null
  /** Croissance des fonds propres en % (sur 3 ans si possible).
   *  Très bon proxy du patrimoine professionnel accumulé par le dirigeant. */
  fonds_propres_growth_pct: number | null
  /** Ratio dettes/fonds propres (D/E) sur le dernier exercice.
   *  > 1 = endetté ; < 0.5 = sain ; négatif = fonds propres négatifs. */
  debt_to_equity: number | null
  /** Variation d'effectif sur 3 ans (en absolu). */
  effectif_delta_3y: number | null
  /** Nombre d'années de finances disponibles (1 à 5). */
  years_available: number
  /** Année du dernier exercice disponible. */
  latest_year: number | null
}

const EMPTY_DERIVATIVES: FinanceDerivatives = {
  ca_growth_yoy: null,
  ca_growth_3y_cagr: null,
  ca_trajectory: 'unknown',
  marge_ebitda_delta_pts: null,
  resultat_growth_yoy: null,
  fonds_propres_growth_pct: null,
  debt_to_equity: null,
  effectif_delta_3y: null,
  years_available: 0,
  latest_year: null,
}

/** Round to 1 decimal — finance signals don't need more precision than that. */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Returns finances sorted from most recent to oldest. Non-mutating. */
function sortedDesc(finances: FinanceYear[]): FinanceYear[] {
  return [...finances].sort((a, b) => b.annee - a.annee)
}

/** Compute growth rate between two values, safely. Returns null on div-by-zero
 *  or negative-to-positive transitions (meaningless ratio). */
function pctGrowth(recent: number | null | undefined, older: number | null | undefined): number | null {
  if (recent == null || older == null) return null
  if (older === 0) return null
  // Avoid sign flip producing misleading +∞-ish numbers
  if (older < 0 && recent > 0) return null
  if (older > 0 && recent < 0) return null
  return round1(((recent - older) / Math.abs(older)) * 100)
}

/** CAGR over N years. recent/oldest both positive non-zero. */
function cagr(recent: number, oldest: number, years: number): number | null {
  if (oldest <= 0 || recent <= 0 || years < 1) return null
  const ratio = recent / oldest
  const raw = Math.pow(ratio, 1 / years) - 1
  if (!Number.isFinite(raw)) return null
  return round1(raw * 100)
}

/**
 * Classify the CA trajectory. Uses CAGR when ≥ 3 years are available,
 * YoY otherwise. Detects "volatile" when the standard deviation of YoY
 * growth across the available window is high (oscillation).
 */
function classifyTrajectory(
  finances: FinanceYear[], // sorted desc
): Trajectory {
  if (finances.length < 2) return 'unknown'

  // Build the sequence of YoY growth rates we can compute.
  const yoyRates: number[] = []
  for (let i = 0; i < finances.length - 1; i++) {
    const recent = finances[i].chiffre_affaires
    const older = finances[i + 1].chiffre_affaires
    const g = pctGrowth(recent, older)
    if (g !== null) yoyRates.push(g)
  }
  if (yoyRates.length === 0) return 'unknown'

  // Volatility check: stddev > 25 points = significantly volatile
  if (yoyRates.length >= 2) {
    const mean = yoyRates.reduce((a, b) => a + b, 0) / yoyRates.length
    const variance =
      yoyRates.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / yoyRates.length
    const stddev = Math.sqrt(variance)
    if (stddev > 25) return 'volatile'
  }

  // Prefer CAGR over the full window for the trajectory classification
  const oldest = finances[finances.length - 1]
  const recent = finances[0]
  const years = recent.annee - oldest.annee
  let signalRate: number | null = null
  if (years >= 2 && oldest.chiffre_affaires != null && recent.chiffre_affaires != null) {
    signalRate = cagr(recent.chiffre_affaires, oldest.chiffre_affaires, years)
  }
  if (signalRate === null) {
    signalRate = yoyRates[0] // most recent YoY
  }

  if (signalRate > 8) return 'growth'
  if (signalRate < -8) return 'decline'
  return 'stable'
}

/**
 * Compute all finance derivatives. Pure function — returns the empty
 * derivatives object when no finances are available so the scorer can
 * always read the fields without nullchecks at the consumer.
 */
export function computeFinanceDerivatives(
  finances: FinanceYear[] | undefined,
): FinanceDerivatives {
  if (!finances || finances.length === 0) return EMPTY_DERIVATIVES
  const sorted = sortedDesc(finances)
  const recent = sorted[0]
  const result: FinanceDerivatives = { ...EMPTY_DERIVATIVES }

  result.years_available = sorted.length
  result.latest_year = recent.annee

  // CA growth YoY (recent vs previous available year)
  if (sorted.length >= 2) {
    result.ca_growth_yoy = pctGrowth(
      recent.chiffre_affaires,
      sorted[1].chiffre_affaires,
    )
  }

  // CA CAGR 3-year — uses the year ~3 back (or oldest available within window)
  if (sorted.length >= 3) {
    // Find the year roughly 3 years ago. Some Pappers rows skip years.
    const target = recent.annee - 3
    const oldest =
      sorted.find((f) => f.annee <= target) ?? sorted[sorted.length - 1]
    const years = recent.annee - oldest.annee
    if (
      years >= 1 &&
      recent.chiffre_affaires != null &&
      oldest.chiffre_affaires != null &&
      recent.chiffre_affaires > 0 &&
      oldest.chiffre_affaires > 0
    ) {
      result.ca_growth_3y_cagr = cagr(
        recent.chiffre_affaires,
        oldest.chiffre_affaires,
        years,
      )
    }
  }

  // CA trajectory classification
  result.ca_trajectory = classifyTrajectory(sorted)

  // Marge EBITDA delta in percentage points (recent - oldest)
  const oldest = sorted[sorted.length - 1]
  if (
    recent.taux_marge_EBITDA != null &&
    oldest.taux_marge_EBITDA != null &&
    sorted.length >= 2
  ) {
    result.marge_ebitda_delta_pts = round1(
      recent.taux_marge_EBITDA - oldest.taux_marge_EBITDA,
    )
  }

  // Résultat net growth YoY
  if (sorted.length >= 2) {
    result.resultat_growth_yoy = pctGrowth(
      recent.resultat,
      sorted[1].resultat,
    )
  }

  // Fonds propres growth (% sur 3 ans si dispo, sinon YoY)
  if (sorted.length >= 3) {
    const target = recent.annee - 3
    const oldFp =
      sorted.find((f) => f.annee <= target) ?? sorted[sorted.length - 1]
    result.fonds_propres_growth_pct = pctGrowth(
      recent.fonds_propres,
      oldFp.fonds_propres,
    )
  } else if (sorted.length >= 2) {
    result.fonds_propres_growth_pct = pctGrowth(
      recent.fonds_propres,
      sorted[1].fonds_propres,
    )
  }

  // Debt-to-Equity ratio on latest year
  if (
    recent.dettes_financieres != null &&
    recent.fonds_propres != null &&
    recent.fonds_propres !== 0
  ) {
    result.debt_to_equity = round1(
      recent.dettes_financieres / recent.fonds_propres,
    )
  }

  // Effectif delta sur 3 ans (en absolu)
  if (sorted.length >= 3) {
    const target = recent.annee - 3
    const oldEff = sorted.find((f) => f.annee <= target) ?? sorted[sorted.length - 1]
    if (recent.effectif != null && oldEff.effectif != null) {
      result.effectif_delta_3y = recent.effectif - oldEff.effectif
    }
  } else if (sorted.length >= 2) {
    if (recent.effectif != null && sorted[1].effectif != null) {
      result.effectif_delta_3y = recent.effectif - sorted[1].effectif
    }
  }

  return result
}

/**
 * Human-readable French summary line for the scorer prompt.
 * Returns a one-liner suitable for inclusion in a prompt section.
 *
 * Examples:
 *   "Croissance CA: +18.5% YoY (CAGR 3y +14.2%) · trajectoire growth"
 *   "Décroissance CA: -8.0% YoY · trajectoire decline · marge EBITDA -3.5 pts"
 *   "Pas assez de données financières"
 */
export function summarizeDerivatives(d: FinanceDerivatives): string {
  if (d.years_available === 0) return 'Pas de données financières'

  const parts: string[] = []
  if (d.ca_growth_yoy != null) {
    parts.push(`CA YoY ${d.ca_growth_yoy >= 0 ? '+' : ''}${d.ca_growth_yoy}%`)
  }
  if (d.ca_growth_3y_cagr != null) {
    parts.push(`CAGR 3y ${d.ca_growth_3y_cagr >= 0 ? '+' : ''}${d.ca_growth_3y_cagr}%`)
  }
  if (d.ca_trajectory !== 'unknown') {
    parts.push(`trajectoire ${d.ca_trajectory}`)
  }
  if (d.marge_ebitda_delta_pts != null && Math.abs(d.marge_ebitda_delta_pts) >= 0.5) {
    const sign = d.marge_ebitda_delta_pts >= 0 ? '+' : ''
    parts.push(`marge EBITDA ${sign}${d.marge_ebitda_delta_pts} pts`)
  }
  if (d.fonds_propres_growth_pct != null) {
    parts.push(`fonds propres ${d.fonds_propres_growth_pct >= 0 ? '+' : ''}${d.fonds_propres_growth_pct}%`)
  }
  if (d.debt_to_equity != null) {
    parts.push(`D/E ${d.debt_to_equity}`)
  }
  if (d.effectif_delta_3y != null && d.effectif_delta_3y !== 0) {
    const sign = d.effectif_delta_3y >= 0 ? '+' : ''
    parts.push(`effectif ${sign}${d.effectif_delta_3y} 3y`)
  }

  return parts.length > 0 ? parts.join(' · ') : `${d.years_available} an(s) de finances, dérivées non calculables`
}
