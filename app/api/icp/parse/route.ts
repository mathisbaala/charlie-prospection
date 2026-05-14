import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseIcp } from '@/lib/claude/icp-parser'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const description = body?.description
  if (!description?.trim()) {
    return NextResponse.json({ error: 'Description requise' }, { status: 400 })
  }

  const { data: membership } = await supabase
    .from('prospection_organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization found' }, { status: 400 })

  const { criteria, linkedinQueries } = await parseIcp(description)

  // Check for existing active ICP
  const { data: existingIcp } = await supabase
    .from('prospection_icps')
    .select('id')
    .eq('org_id', membership.org_id)
    .eq('status', 'active')
    .single()

  let icp, error
  if (existingIcp) {
    // Update existing
    ;({ data: icp, error } = await supabase
      .from('prospection_icps')
      .update({
        raw_description: description,
        parsed_criteria: criteria,
        linkedin_queries: linkedinQueries,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingIcp.id)
      .select()
      .single())
  } else {
    // Insert new
    ;({ data: icp, error } = await supabase
      .from('prospection_icps')
      .insert({
        org_id: membership.org_id,
        raw_description: description,
        parsed_criteria: criteria,
        linkedin_queries: linkedinQueries,
        status: 'active',
      })
      .select()
      .single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ icp })
}
