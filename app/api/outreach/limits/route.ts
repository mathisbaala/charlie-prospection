// GET   /api/outreach/limits — récupère les limites quotidiennes de l'utilisateur
// PATCH /api/outreach/limits — modifie les limites (auth Supabase, pas extension)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ABSOLUTE_MAX = {
  invitation: 100,
  dm: 150,
  check_connection: 300,
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: session } = await supabase
    .from('prospection_linkedin_sessions')
    .select('daily_invitation_limit, daily_dm_limit, daily_check_connection_limit')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    daily_invitation_limit: session?.daily_invitation_limit ?? 30,
    daily_dm_limit: session?.daily_dm_limit ?? 50,
    daily_check_connection_limit: session?.daily_check_connection_limit ?? 100,
    max: ABSOLUTE_MAX,
    safe_zone: { invitation: 30, dm: 50, check_connection: 100 },
  })
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const updates: Record<string, number> = {}
  function clamp(value: unknown, key: 'invitation' | 'dm' | 'check_connection'): number | null {
    const n = Number(value)
    if (!Number.isFinite(n) || n < 1) return null
    return Math.min(n, ABSOLUTE_MAX[key])
  }

  if (body.daily_invitation_limit !== undefined) {
    const v = clamp(body.daily_invitation_limit, 'invitation')
    if (v) updates.daily_invitation_limit = v
  }
  if (body.daily_dm_limit !== undefined) {
    const v = clamp(body.daily_dm_limit, 'dm')
    if (v) updates.daily_dm_limit = v
  }
  if (body.daily_check_connection_limit !== undefined) {
    const v = clamp(body.daily_check_connection_limit, 'check_connection')
    if (v) updates.daily_check_connection_limit = v
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Aucune valeur valide' }, { status: 400 })
  }

  const { error } = await supabase
    .from('prospection_linkedin_sessions')
    .update(updates)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, updates })
}
