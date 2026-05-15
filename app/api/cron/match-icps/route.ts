import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { mapLocationsToDepartements, mapRolesToNaf } from '@/lib/prospect-search/naf-mapper'
import type { ParsedIcpCriteria } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Only match signals from the last N days. Keeps the cron bounded and avoids
// re-flagging deep history every run.
const MATCH_WINDOW_DAYS = 14

function unauthorized() {
  return new NextResponse('Unauthorized', { status: 401 })
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

interface IcpRow {
  id: string
  org_id: string
  parsed_criteria: ParsedIcpCriteria
}

async function runMatching(): Promise<{
  icps_evaluated: number
  icps_skipped_empty: number
  total_matches: number
  per_icp: Array<{ icp_id: string; org_id: string; matches: number }>
}> {
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: icps, error } = await supabase
    .from('prospection_icps')
    .select('id, org_id, parsed_criteria')
    .eq('status', 'active')

  if (error) throw new Error(`fetching active ICPs failed: ${error.message}`)

  const since = new Date(Date.now() - MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const perIcp: Array<{ icp_id: string; org_id: string; matches: number }> = []
  let skippedEmpty = 0
  let totalMatches = 0

  for (const icp of (icps ?? []) as IcpRow[]) {
    const criteria = icp.parsed_criteria ?? ({ roles: [], locations: [] } as Partial<ParsedIcpCriteria>)
    const roles = criteria.roles ?? []
    const locations = criteria.locations ?? []
    const { codes: nafCodes } = mapRolesToNaf(roles)
    const departements = mapLocationsToDepartements(locations)

    if (nafCodes.length === 0 && departements.length === 0) {
      skippedEmpty += 1
      perIcp.push({ icp_id: icp.id, org_id: icp.org_id, matches: 0 })
      continue
    }

    const { data: matched, error: rpcError } = await supabase.rpc('append_matched_org_to_signals', {
      p_org_id: icp.org_id,
      p_naf_codes: nafCodes,
      p_departements: departements,
      p_since: since,
    })
    if (rpcError) {
      throw new Error(`RPC append_matched_org_to_signals failed for icp ${icp.id}: ${rpcError.message}`)
    }
    const count = Array.isArray(matched) ? matched.length : 0
    totalMatches += count
    perIcp.push({ icp_id: icp.id, org_id: icp.org_id, matches: count })
  }

  return {
    icps_evaluated: (icps ?? []).length,
    icps_skipped_empty: skippedEmpty,
    total_matches: totalMatches,
    per_icp: perIcp,
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized()
  try {
    const result = await runMatching()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
