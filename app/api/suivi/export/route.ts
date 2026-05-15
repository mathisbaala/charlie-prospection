import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildProspectsCsv } from '@/lib/personas/csv-helpers'
import type { Icp, Prospect } from '@/lib/types'

/**
 * GET /api/suivi/export — download a CSV of /suivi prospects.
 *
 * Filters: org-scoped (RLS), optional ?persona=<id> to scope to a single
 * persona. Output is RFC 4180 with UTF-8 BOM for Excel compat.
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('prospection_organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 400 })

  const url = new URL(request.url)
  const personaId = url.searchParams.get('persona') || null

  // Fetch prospects + personas concurrently. The cap at 5000 keeps a single
  // request bounded — orgs with more than that volume should hit a paginated
  // export endpoint (not implemented yet).
  let prospectsQuery = supabase
    .from('prospection_prospects')
    .select('*')
    .eq('org_id', membership.org_id)
    .order('patrimony_score', { ascending: false })
    .limit(5000)
  if (personaId) prospectsQuery = prospectsQuery.eq('icp_id', personaId)

  const [{ data: prospects }, { data: personas }] = await Promise.all([
    prospectsQuery,
    supabase.from('prospection_icps').select('id, name').eq('org_id', membership.org_id),
  ])

  const csv = buildProspectsCsv(
    (prospects ?? []) as Prospect[],
    ((personas ?? []) as Pick<Icp, 'id' | 'name'>[]) as unknown as Icp[],
  )

  const stamp = new Date().toISOString().slice(0, 10)
  const filename = personaId ? `suivi-${stamp}-persona.csv` : `suivi-${stamp}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
