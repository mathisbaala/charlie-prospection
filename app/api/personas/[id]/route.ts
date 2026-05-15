import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ParsedIcpCriteria, StrictFilters } from '@/lib/types'

interface PatchBody {
  name?: string
  raw_description?: string
  parsed_criteria?: ParsedIcpCriteria
  strict_filters?: StrictFilters
  status?: 'active' | 'paused'
}

async function getOrg() {
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

/** PATCH /api/personas/[id] — partial update. RLS scopes to the user's org. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const { supabase, user, orgId } = await getOrg()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 })

  const body: PatchBody = await request.json().catch(() => ({}))

  // Build patch object only from provided fields — don't clobber unspecified columns.
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.name === 'string' && body.name.trim().length > 0) patch.name = body.name.trim()
  if (typeof body.raw_description === 'string') patch.raw_description = body.raw_description
  if (body.parsed_criteria) patch.parsed_criteria = body.parsed_criteria
  if (body.strict_filters) patch.strict_filters = body.strict_filters
  if (body.status === 'active' || body.status === 'paused') patch.status = body.status

  const { data: persona, error } = await supabase
    .from('prospection_icps')
    .update(patch)
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `Une cible nommée "${patch.name}" existe déjà.` },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })

  return NextResponse.json({ persona })
}

/** DELETE /api/personas/[id] — soft contract: prospects keep icp_id=null
 *  (FK on delete set null is already in place from the initial migration). */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const { supabase, user, orgId } = await getOrg()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 })

  const { error } = await supabase
    .from('prospection_icps')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** GET /api/personas/[id] — single persona fetch for prefill. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const { supabase, user, orgId } = await getOrg()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 })

  const { data: persona, error } = await supabase
    .from('prospection_icps')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!persona) return NextResponse.json({ error: 'Persona not found' }, { status: 404 })

  return NextResponse.json({ persona })
}
