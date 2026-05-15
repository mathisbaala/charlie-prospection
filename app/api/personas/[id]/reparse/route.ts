import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseIcp } from '@/lib/claude/icp-parser'

/**
 * POST /api/personas/[id]/reparse — re-run Claude on the current
 * `raw_description` and overwrite `parsed_criteria` + `linkedin_queries`.
 *
 * Triggered explicitly by a "Ré-analyser" button so the user doesn't lose
 * their manual filter edits every time they tweak the description text.
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
    .select('id, raw_description')
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

  const { criteria, linkedinQueries } = await parseIcp(description)

  const { data: persona, error } = await supabase
    .from('prospection_icps')
    .update({
      parsed_criteria: criteria,
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
