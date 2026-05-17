// DELETE /api/outreach/campaigns/[id]/enrollments
// Retire une liste d'enrôlements d'une campagne (suppression en bulk).
// Body: { enrollment_ids: string[] }
// Le prospect lui-même n'est PAS supprimé — il reste dans la base, juste désinscrit
// de cette campagne. Pour supprimer un prospect totalement, utiliser DELETE /prospects/[id].

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(request: Request, ctx: Ctx) {
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
  const enrollment_ids: unknown = body?.enrollment_ids
  if (!Array.isArray(enrollment_ids) || enrollment_ids.length === 0) {
    return NextResponse.json({ error: 'enrollment_ids required (array)' }, { status: 400 })
  }

  // Vérifier que la campagne appartient à l'org
  const { data: campaign } = await supabase
    .from('prospection_campaigns')
    .select('id')
    .eq('id', campaign_id)
    .eq('org_id', membership.org_id)
    .maybeSingle()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  // Suppression scope à la campagne + l'org (double sécurité)
  const { error, count } = await supabase
    .from('prospection_campaign_enrollments')
    .delete({ count: 'exact' })
    .eq('campaign_id', campaign_id)
    .eq('org_id', membership.org_id)
    .in('id', enrollment_ids as string[])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ deleted: count ?? 0 })
}
