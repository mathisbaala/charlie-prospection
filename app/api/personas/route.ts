import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseIcp } from '@/lib/claude/icp-parser'

/** Persona name derivation when the user didn't provide one. */
function deriveName(description: string): string {
  const trimmed = description.trim().slice(0, 60).trim()
  return trimmed.length > 0 ? trimmed : 'Persona principale'
}

async function getMembership() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, orgId: null as string | null }

  const { data: membership } = await supabase
    .from('prospection_organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()

  return { supabase, user, orgId: membership?.org_id ?? null }
}

/** GET /api/personas — list personas for the current org.
 *
 * Each persona is decorated with `prospect_count` (number of /suivi prospects
 * attached) so the UI can warn before deletion + show counts in the list.
 */
export async function GET() {
  const { supabase, user, orgId } = await getMembership()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 })

  const { data, error } = await supabase
    .from('prospection_icps')
    .select('*, prospect_count:prospection_prospects(count)')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // PostgREST returns aggregate as { count } objects; normalise to a flat number.
  const personas = (data ?? []).map((p: { prospect_count?: Array<{ count: number }> | number } & Record<string, unknown>) => ({
    ...p,
    prospect_count: Array.isArray(p.prospect_count)
      ? (p.prospect_count[0]?.count ?? 0)
      : (typeof p.prospect_count === 'number' ? p.prospect_count : 0),
  }))

  return NextResponse.json({ personas })
}

/** POST /api/personas — create a new persona by parsing a natural-language description. */
export async function POST(request: Request) {
  const { supabase, user, orgId } = await getMembership()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 })

  const body = await request.json().catch(() => null)
  const description: string | undefined = body?.description
  if (!description?.trim()) {
    return NextResponse.json({ error: 'Description requise' }, { status: 400 })
  }
  const name: string = (body?.name?.trim() as string) || deriveName(description)

  const { criteria, linkedinQueries } = await parseIcp(description)

  const { data: persona, error } = await supabase
    .from('prospection_icps')
    .insert({
      org_id: orgId,
      name,
      raw_description: description,
      parsed_criteria: criteria,
      linkedin_queries: linkedinQueries,
      strict_filters: {},
      status: 'active',
    })
    .select()
    .single()

  if (error) {
    // Unique constraint on (org_id, lower(name)) — surfaces as 23505 in Postgres.
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `Une cible nommée "${name}" existe déjà. Choisissez un autre nom.` },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ persona })
}
