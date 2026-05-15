import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * DELETE /api/prospects/[id]/activity/[activityId] — remove a single
 * activity entry. RLS restricts this to the row's author (see migration
 * 20260517000000 — policy "authors can delete their own activity").
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; activityId: string }> },
) {
  const { activityId } = await ctx.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('prospection_prospect_activity')
    .delete()
    .eq('id', activityId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
