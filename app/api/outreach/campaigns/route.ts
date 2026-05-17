// GET  /api/outreach/campaigns — liste les campagnes de l'org
// POST /api/outreach/campaigns — crée une campagne avec ses steps

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DEFAULT_STEPS } from '@/lib/outreach/campaign-helpers'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('prospection_organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 400 })

  const { data, error } = await supabase
    .from('prospection_campaigns')
    .select(`
      id, name, emoji, status, created_at, updated_at,
      steps:prospection_campaign_steps(id, position, type, delay_days, template),
      enrollments:prospection_campaign_enrollments(id, status)
    `)
    .eq('org_id', membership.org_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrichir avec compteurs et breakdown par statut
  const campaigns = (data ?? []).map(c => {
    const enrs: { status: string }[] = c.enrollments ?? []
    const count = (s: string | string[]) =>
      Array.isArray(s) ? enrs.filter(e => s.includes(e.status)).length : enrs.filter(e => e.status === s).length
    return {
      ...c,
      steps: (c.steps ?? []).sort((a: { position: number }, b: { position: number }) => a.position - b.position),
      enrollment_count: enrs.length,
      active_count: enrs.filter(e => !['finished', 'failed', 'opted_out'].includes(e.status)).length,
      status_breakdown: {
        searching:  count(['pending', 'profile_search']),
        invited:    count('invitation_sent'),
        connected:  count('connected'),
        messaged:   count('dm_sent'),
        replied:    count('replied'),
        finished:   count('finished'),
        failed:     count(['failed', 'opted_out']),
      },
      enrollments: undefined,
    }
  })

  return NextResponse.json({ campaigns })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('prospection_organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 400 })

  const body = await request.json().catch(() => null)
  const { name, emoji = '🎯', steps } = body ?? {}

  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const { data: campaign, error: cErr } = await supabase
    .from('prospection_campaigns')
    .insert({
      org_id: membership.org_id,
      created_by: user.id,
      name: name.trim(),
      emoji,
      status: 'draft',
    })
    .select()
    .single()

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  // Insérer les steps (fournis ou par défaut)
  const stepsToInsert = (steps ?? DEFAULT_STEPS).map(
    (s: { position: number; type: string; delay_days: number; template: string }, i: number) => ({
      campaign_id: campaign.id,
      org_id: membership.org_id,
      position: s.position ?? i + 1,
      type: s.type,
      delay_days: s.delay_days ?? 0,
      template: s.template ?? '',
    })
  )

  const { error: sErr } = await supabase.from('prospection_campaign_steps').insert(stepsToInsert)
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })

  return NextResponse.json({ campaign }, { status: 201 })
}
