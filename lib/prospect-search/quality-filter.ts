import type { FinanceYear, ProspectEnrichmentData } from '@/lib/types'

/**
 * Post-enrichment quality filter — drops candidates that are clearly
 * off-target BEFORE the expensive Claude scoring runs.
 *
 * Rationale: 95% of the noise in /recherche results comes from a few
 * obvious red flags that all signal "this entity is not actually a
 * qualifying prospect" :
 *   - Société en procédure collective (déjà en faillite / rachat — pas
 *     un prospect, et leur fiche financière est de toute façon obsolète)
 *   - Coquille vide (aucune finance Pappers + aucun établissement —
 *     entité juridique inactive)
 *   - Société dormante (dernières finances > 3 ans — soit elle n'a
 *     plus d'obligation de publication = micro, soit elle est en
 *     sommeil)
 *
 * Filtering before scoring saves ~2 Claude calls per dropped candidate
 * AND élimine le bruit que le user a aujourd'hui dans /recherche.
 *
 * Optionnel : seuil "micro" pour les personas qui ciblent explicitement
 * des dirigeants établis (CGP ne veut pas un freelance avec 50K€ de CA).
 */

export interface QualityAssessment {
  drop: boolean
  reasons: string[]
}

export interface QualityFilterOptions {
  /** Drop if procedure_collective_en_cours = true. Default true. */
  excludeFailing?: boolean
  /** Drop if no finances + no establishment data at all. Default true. */
  excludeEmpty?: boolean
  /** Drop if latest finance year is older than N years. Default true with
   *  threshold 3 years. Set to false for personas qui ciblent des
   *  créations récentes. */
  excludeDormant?: boolean
  /** Threshold for "dormant" — number of years since the latest published
   *  finance year. Default 3. */
  dormantYearThreshold?: number
  /** Drop micro-entities: latest CA < threshold AND latest effectif ≤ N.
   *  Default false (les CGP qui ciblent les libéraux ont besoin des
   *  petites structures). Activable per-persona dans une v2. */
  excludeMicro?: boolean
  /** Default 200_000 €. */
  microCaThreshold?: number
  /** Default 2 (≤ 2 salariés). */
  microEffectifMax?: number
}

/** Returns the most recent FinanceYear by `annee` desc, or null. */
function latestFinance(finances: FinanceYear[] | undefined): FinanceYear | null {
  if (!finances || finances.length === 0) return null
  // Don't mutate caller's array
  return [...finances].sort((a, b) => b.annee - a.annee)[0]
}

/**
 * Assess whether a prospect should be dropped before scoring.
 * Returns { drop, reasons } — reasons is a list of human-readable French
 * strings, used both for logging aggregate breakdown and for the UI
 * "X prospects filtrés (raison Y, Z)" subtitle.
 */
export function assessProspectQuality(
  enrichment: ProspectEnrichmentData,
  options: QualityFilterOptions = {},
): QualityAssessment {
  const reasons: string[] = []

  const excludeFailing = options.excludeFailing ?? true
  const excludeEmpty = options.excludeEmpty ?? true
  const excludeDormant = options.excludeDormant ?? true
  const dormantThreshold = options.dormantYearThreshold ?? 3
  const excludeMicro = options.excludeMicro ?? false
  const microCa = options.microCaThreshold ?? 200_000
  const microEffectif = options.microEffectifMax ?? 2

  // 1. Procédure collective — toujours un drop par défaut. Un CGP ne
  //    démarche pas un dirigeant dont la boîte est en faillite.
  if (excludeFailing && enrichment.procedure_collective_en_cours === true) {
    reasons.push('Procédure collective en cours')
  }

  // 2. Coquille vide — pas de données financières ET pas d'établissement.
  //    Indique soit une entité juridique récente sans activité, soit une
  //    boîte dormante non publiée. Dans les deux cas : pas un prospect.
  const finances = enrichment.finances ?? []
  const hasFinances = finances.length > 0
  const nbEtab = enrichment.nb_etablissements ?? null

  if (excludeEmpty && !hasFinances && (nbEtab === 0 || nbEtab === null)) {
    // null check is intentional — sans donnée du tout, on drop
    if (nbEtab === 0) {
      reasons.push('Coquille vide (0 établissement, aucune finance)')
    } else if (nbEtab === null && !enrichment.code_naf) {
      // Aucune info Pappers du tout → drop
      reasons.push('Aucune donnée Pappers récupérée')
    }
  }

  // 3. Dormante — dernière finance vieille de > N ans. Sociétés en sommeil,
  //    micro-entreprises non publiées, ou décès du dirigeant non radié.
  const latest = latestFinance(finances)
  if (excludeDormant && latest && latest.annee) {
    const currentYear = new Date().getFullYear()
    const yearsSinceLatest = currentYear - latest.annee
    if (yearsSinceLatest > dormantThreshold) {
      reasons.push(`Dormante (dernière finance ${latest.annee})`)
    }
  }

  // 4. Micro (optionnel) — CA + effectif tous les deux faibles.
  //    Désactivé par défaut car beaucoup de libéraux pertinents sont des
  //    one-man shops avec 80-150K€ de CA. À activer per-persona.
  if (excludeMicro && latest) {
    const ca = latest.chiffre_affaires ?? null
    const eff = latest.effectif ?? null
    // Les deux doivent être faibles pour drop (sinon on garde les "low
    // CA / many employees" qui sont des associations / start-ups)
    const caIsMicro = ca !== null && ca < microCa
    const effIsMicro = eff !== null && eff <= microEffectif
    if (caIsMicro && effIsMicro) {
      reasons.push(`Micro (CA<${(microCa / 1000).toFixed(0)}K€, eff≤${microEffectif})`)
    }
  }

  return { drop: reasons.length > 0, reasons }
}

/**
 * Aggregate the reasons across a batch of dropped candidates for the
 * UI breakdown. Returns `{ "Procédure collective": 3, "Dormante": 12, ... }`.
 */
export function aggregateDropReasons(
  assessments: Array<QualityAssessment | null>,
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const a of assessments) {
    if (!a || !a.drop) continue
    for (const reason of a.reasons) {
      // Strip year-specific details for aggregation
      // ("Dormante (dernière finance 2020)" → "Dormante")
      const key = reason.replace(/\s*\([^)]*\)\s*$/, '').trim() || reason
      counts[key] = (counts[key] ?? 0) + 1
    }
  }
  return counts
}
