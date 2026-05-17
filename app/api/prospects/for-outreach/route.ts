// GET /api/prospects/for-outreach
// Liste les prospects du suivi disponibles pour une campagne.
// Retourne ceux en crm_stage 'to_contact' ou 'new' (pas encore engagés).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
    .from('prospection_prospects')
    .select('id, linkedin_url, linkedin_data, enrichment_data, patrimony_score, crm_stage')
    .eq('org_id', membership.org_id)
    .order('patrimony_score', { ascending: false, nullsFirst: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prospects: data ?? [] })
}
