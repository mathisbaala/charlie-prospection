import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function unauthorized() {
  return new NextResponse('Unauthorized', { status: 401 })
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

/**
 * Quotidien : matche les signaux fraîchement ingérés (inbox J-2) contre tous
 * les prospects en `/suivi` (icp_id is not null), via TOUTES leurs sociétés
 * trackées (principale + portfolio SCI/holdings/autres). Insère deduped dans
 * `prospection_signals` et bump `last_signal_at`.
 *
 * La pass org-wide legacy (`append_matched_org_to_signals` qui maintenait
 * `prospection_signals_inbox.matched_org_ids[]`) a été retirée — son seul
 * consommateur était IntelligenceStrip V1 qui n'existe plus dans le code.
 * Le RPC + la column DB sont conservés pour le moment (cleanup dans 2-4
 * semaines, cf. INTELLIGENCE_BACKLOG §13).
 */
async function runMatching(): Promise<{ per_prospect_signals_emitted: number }> {
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: emitted, error } = await supabase.rpc('emit_signals_for_tracked_sirens', {
    p_since: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  })
  if (error) throw new Error(`emit_signals_for_tracked_sirens failed: ${error.message}`)

  return {
    per_prospect_signals_emitted: typeof emitted === 'number' ? emitted : 0,
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
