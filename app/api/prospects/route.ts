import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('prospection_organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 400 })

  const { searchParams } = new URL(request.url)
  const stage = searchParams.get('stage')
  const minScore = searchParams.get('min_score')
  const page = parseInt(searchParams.get('page') ?? '1')
  const perPage = Math.min(parseInt(searchParams.get('per_page') ?? '20'), 100)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('prospection_prospects')
    .select('*', { count: 'exact' })
    .eq('org_id', membership.org_id)
    .order('patrimony_score', { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1)

  if (stage) query = query.eq('crm_stage', stage)
  if (minScore) query = query.gte('patrimony_score', parseInt(minScore))

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ prospects: data, total: count, page, per_page: perPage })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('prospection_organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 400 })

  // Delete signals first (FK), then prospects
  await supabase.from('prospection_signals').delete().eq('org_id', membership.org_id)
  const { error } = await supabase.from('prospection_prospects').delete().eq('org_id', membership.org_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
