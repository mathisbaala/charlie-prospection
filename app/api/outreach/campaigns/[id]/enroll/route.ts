// POST /api/outreach/campaigns/[id]/enroll
// Enrôle une liste de prospect_ids dans la campagne.
// Ignore les prospects déjà enrôlés (idempotent).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, ctx: Ctx) {
  const { id: campaign_id } = await ctx.params
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
  const { prospect_ids } = body ?? {}
  if (!Array.isArray(prospect_ids) || prospect_ids.length === 0) {
    return NextResponse.json({ error: 'prospect_ids required (array)' }, { status: 400 })
  }
  if (prospect_ids.length > 500) {
    return NextResponse.json({ error: 'Max 500 prospects per batch' }, { status: 400 })
  }

  // Vérifier que la campagne appartient à l'org
  const { data: campaign } = await supabase
    .from('prospection_campaigns')
    .select('id')
    .eq('id', campaign_id)
    .eq('org_id', membership.org_id)
    .maybeSingle()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const rows = prospect_ids.map((pid: string) => ({
    campaign_id,
    prospect_id: pid,
    org_id: membership.org_id,
    status: 'pending',
  }))

  // upsert ignorant les doublons
  const { data, error } = await supabase
    .from('prospection_campaign_enrollments')
    .upsert(rows, { onConflict: 'campaign_id,prospect_id', ignoreDuplicates: true })
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ enrolled: data?.length ?? 0 }, { status: 201 })
}
