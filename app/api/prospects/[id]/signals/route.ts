import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/prospects/[id]/signals — per-prospect signal timeline.
 * Returns the rows from prospection_signals scoped to this prospect, sorted
 * by detected_at DESC. RLS limits to the user's org.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('prospection_signals')
    .select('id, type, source, data, valeur_estimee, detected_at, read')
    .eq('prospect_id', id)
    .order('detected_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ signals: data ?? [] })
}
