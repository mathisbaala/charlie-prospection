import type { ParsedIcpCriteria, SignalType } from '@/lib/types'

/**
 * Persona name derivation when the user didn't provide one.
 * Takes the first 60 trimmed characters of the description.
 */
export function deriveName(description: string): string {
  const trimmed = description.trim().slice(0, 60).trim()
  return trimmed.length > 0 ? trimmed : 'Persona principale'
}

/**
 * Deduplicated union (case-insensitive on first match) for array fields.
 * Keeps the original casing of the first occurrence.
 */
export function unionDedup(a: string[] | undefined, b: string[] | undefined): string[] {
  const seen = new Map<string, string>()
  for (const x of a ?? []) {
    const k = x.trim().toLowerCase()
    if (k && !seen.has(k)) seen.set(k, x.trim())
  }
  for (const x of b ?? []) {
    const k = x.trim().toLowerCase()
    if (k && !seen.has(k)) seen.set(k, x.trim())
  }
  return Array.from(seen.values())
}

/**
 * Merge a fresh Claude parse result into the user's current edits.
 *
 * Rule (post-audit UX decision): manual filter additions must survive a
 * re-analyse. So array fields are unioned (preserves user adds). Scalar
 * fields prefer the fresh Claude value when defined, falling back to the
 * existing value — assumes the user updated the description deliberately.
 *
 * Trade-off documented in /api/personas/[id]/reparse: if the user manually
 * removed a tag, re-analysing may bring it back. They can re-remove via X.
 */
export function mergeCriteria(
  current: ParsedIcpCriteria,
  fresh: ParsedIcpCriteria,
): ParsedIcpCriteria {
  return {
    // Arrays: union — preserve user-added tags
    roles: unionDedup(current.roles, fresh.roles),
    sectors: unionDedup(current.sectors, fresh.sectors),
    locations: unionDedup(current.locations, fresh.locations),
    keywords: unionDedup(current.keywords, fresh.keywords),
    signal_priorities: unionDedup(
      current.signal_priorities,
      fresh.signal_priorities,
    ) as SignalType[],
    // Scalars: prefer fresh when defined, fall back to current
    target_type: fresh.target_type ?? current.target_type,
    seniority_min_years: fresh.seniority_min_years ?? current.seniority_min_years,
    patrimony_level: fresh.patrimony_level ?? current.patrimony_level,
    ca_min: fresh.ca_min ?? current.ca_min,
    ca_max: fresh.ca_max ?? current.ca_max,
    effectif_min: fresh.effectif_min ?? current.effectif_min,
    effectif_max: fresh.effectif_max ?? current.effectif_max,
    age_min: fresh.age_min ?? current.age_min,
    age_max: fresh.age_max ?? current.age_max,
    geo_strict: fresh.geo_strict ?? current.geo_strict,
  }
}

/**
 * Normalises the `prospect_count` aggregate returned by PostgREST.
 *
 * When you ask Supabase for `*, prospect_count:prospection_prospects(count)`,
 * PostgREST returns the count as either `[{count: N}]` (relation form) or
 * directly as a number, depending on join multiplicity. This helper folds
 * both shapes into a plain number so downstream code can use `.prospect_count`
 * without conditional checks.
 */
export function normaliseProspectCount(raw: unknown): number {
  if (typeof raw === 'number') return raw
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0] as { count?: number } | undefined
    return first?.count ?? 0
  }
  return 0
}
