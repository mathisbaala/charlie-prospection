import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseIcp } from '@/lib/claude/icp-parser'
import type { ParsedIcpCriteria, SignalType } from '@/lib/types'

/**
 * POST /api/personas/[id]/reparse — re-run Claude on the current
 * `raw_description` and merge the result with the existing `parsed_criteria`.
 *
 * UX rule (post-audit): re-analysing must NOT wipe the user's manual filter
 * edits. We take the union of array fields (roles, sectors, locations,
 * keywords, signal_priorities), so anything the user added by hand survives.
 * Numeric / scalar fields (target_type, ca_min/max, effectif_min/max,
 * age_min/max, patrimony_level, geo_strict, seniority_min_years) take the
 * fresh value from Claude when provided, otherwise keep the existing value.
 *
 * Trade-off: if the user manually REMOVED a tag, re-analysing may bring it
 * back. They can remove it again by clicking the X on the chip — that's
 * cheaper than losing manual additions silently.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('prospection_organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 400 })

  const { data: existing, error: fetchErr } = await supabase
    .from('prospection_icps')
    .select('id, raw_description, parsed_criteria')
    .eq('id', id)
    .eq('org_id', membership.org_id)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })

  const description = existing.raw_description
  if (!description?.trim()) {
    return NextResponse.json(
      { error: 'Description vide — modifie-la avant de relancer.' },
      { status: 400 },
    )
  }

  const { criteria: fresh, linkedinQueries } = await parseIcp(description)
  const current = (existing.parsed_criteria ?? {}) as ParsedIcpCriteria
  const merged = mergeCriteria(current, fresh)

  const { data: persona, error } = await supabase
    .from('prospection_icps')
    .update({
      parsed_criteria: merged,
      linkedin_queries: linkedinQueries,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('org_id', membership.org_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ persona })
}

/** Deduplicated union (case-insensitive on first match) for array fields. */
function unionDedup(a: string[] | undefined, b: string[] | undefined): string[] {
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

/** Merge fresh Claude criteria into the user's current edits. */
function mergeCriteria(current: ParsedIcpCriteria, fresh: ParsedIcpCriteria): ParsedIcpCriteria {
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
