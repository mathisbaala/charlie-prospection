// GET    /api/outreach/campaigns/[id] — détail campagne + steps + stats
// PATCH  /api/outreach/campaigns/[id] — modifier nom, emoji, status, steps
// DELETE /api/outreach/campaigns/[id] — supprimer (cascade sur steps + enrollments)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('prospection_campaigns')
    .select(`
      id, name, emoji, status, created_at, updated_at, created_by,
      steps:prospection_campaign_steps(id, position, type, delay_days, template),
      enrollments:prospection_campaign_enrollments(
        id, status, current_step, last_action_at, enrolled_at, invitation_sent_at,
        linkedin_url_resolved, fail_count,
        prospect:prospection_prospects(
          id, linkedin_url, linkedin_data, enrichment_data, patrimony_score, crm_stage
        )
      )
    `)
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  return NextResponse.json({
    campaign: {
      ...data,
      steps: (data.steps ?? []).sort((a: { position: number }, b: { position: number }) => a.position - b.position),
      enrollment_count: (data.enrollments ?? []).length,
      active_count: (data.enrollments ?? []).filter(
        (e: { status: string }) => !['finished', 'failed', 'opted_out'].includes(e.status)
      ).length,
      enrollments: data.enrollments ?? [],
    },
  })
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const { name, emoji, status, steps } = body ?? {}

  const campaignUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) campaignUpdates.name = name.trim()
  if (emoji !== undefined) campaignUpdates.emoji = emoji
  if (status !== undefined) {
    const allowed = ['draft', 'active', 'paused', 'completed']
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    campaignUpdates.status = status
  }

  const { data: campaign, error } = await supabase
    .from('prospection_campaigns')
    .update(campaignUpdates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Remplacer les steps si fournis
  if (Array.isArray(steps)) {
    const { data: membership } = await supabase
      .from('prospection_organization_members')
      .select('org_id')
      .eq('user_id', user.id)
      .maybeSingle()

    await supabase.from('prospection_campaign_steps').delete().eq('campaign_id', id)

    if (steps.length) {
      await supabase.from('prospection_campaign_steps').insert(
        steps.map((s: { position: number; type: string; delay_days: number; template: string }, i: number) => ({
          campaign_id: id,
          org_id: membership!.org_id,
          position: s.position ?? i + 1,
          type: s.type,
          delay_days: s.delay_days ?? 0,
          template: s.template ?? '',
        }))
      )
    }
  }

  return NextResponse.json({ campaign })
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('prospection_campaigns').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
