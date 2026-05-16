import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/prospects/[id]/signals — per-prospect signal timeline.
 * Returns the rows from prospection_signals scoped to this prospect, sorted
 * by detected_at DESC. RLS limits to the user's org.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const rawLimit = parseInt(url.searchParams.get('limit') ?? '', 10)
  const limit = Math.min(Number.isFinite(rawLimit) ? rawLimit : 50, 200)
  const rawOffset = parseInt(url.searchParams.get('offset') ?? '', 10)
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0)

  const { data, error, count } = await supabase
    .from('prospection_signals')
    .select('id, type, source, data, valeur_estimee, detected_at, read', { count: 'exact' })
    .eq('prospect_id', id)
    .order('detected_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ signals: data ?? [], total: count ?? 0, limit, offset })
}
