import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ActivityKind } from '@/lib/types'

const ALLOWED_KINDS: ActivityKind[] = [
  'note',
  'call',
  'email_sent',
  'linkedin_message',
  'meeting',
  'other',
]

/**
 * GET /api/prospects/[id]/activity — list activity log for a prospect.
 * Ordered by occurred_at desc. RLS scopes to the user's org.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('prospection_prospect_activity')
    .select('id, prospect_id, org_id, kind, body, occurred_at, created_by, created_at')
    .eq('prospect_id', id)
    .order('occurred_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ activity: data ?? [] })
}

/**
 * POST /api/prospects/[id]/activity — append a new activity entry.
 * Body: { kind: ActivityKind, body: string, occurred_at?: string }
 *
 * occurred_at defaults to now() — supply a past timestamp if logging a
 * call/meeting that happened earlier.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
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

  // Verify the prospect belongs to this org (RLS would catch it but a
  // clearer error message is friendlier than a silent FK violation).
  const { data: prospect, error: pErr } = await supabase
    .from('prospection_prospects')
    .select('id')
    .eq('id', id)
    .eq('org_id', membership.org_id)
    .maybeSingle()
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
  if (!prospect) return NextResponse.json({ error: 'Prospect introuvable' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const kind = body?.kind as ActivityKind | undefined
  const text = (body?.body as string | undefined)?.trim()
  const occurredAt = typeof body?.occurred_at === 'string' ? body.occurred_at : undefined

  if (!kind || !ALLOWED_KINDS.includes(kind)) {
    return NextResponse.json({ error: 'kind invalide' }, { status: 400 })
  }
  if (!text) {
    return NextResponse.json({ error: 'body requis' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('prospection_prospect_activity')
    .insert({
      prospect_id: id,
      org_id: membership.org_id,
      kind,
      body: text,
      occurred_at: occurredAt,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ activity: data })
}
