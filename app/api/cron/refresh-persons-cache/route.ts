import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { enrichProspect } from '@/lib/enrichment/enricher'
import { scorePatrimony } from '@/lib/enrichment/patrimony-scorer'
import type { RawProspect } from '@/lib/prospect-search/engine'
import { ENRICHMENT_STALE_DAYS } from '@/lib/persons-cache/constants'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function unauthorized() {
  return new NextResponse('Unauthorized', { status: 401 })
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization') ?? ''
  return header === `Bearer ${secret}`
}

async function runRefresh(): Promise<{
  refreshed: number
  total: number
}> {
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const staleThreshold = new Date()
  staleThreshold.setDate(staleThreshold.getDate() - ENRICHMENT_STALE_DAYS)

  const { data: stale, error } = await supabase
    .from('prospection_persons_cache')
    .select('canonical_key, raw_data')
    .eq('enrichment_level', 'standard')
    .lt('last_enriched_at', staleThreshold.toISOString())
    // High-value-first: refresh best prospects soonest (vs. refresh-enrichment which uses stalest-first)
    .order('patrimony_score', { ascending: false, nullsFirst: false })
    .limit(30)

  if (error) {
    throw new Error(`persons_cache select failed: ${error.message}`)
  }

  if (!stale?.length) {
    return { refreshed: 0, total: 0 }
  }

  const results = await Promise.allSettled(
    stale.map(async (row) => {
      const raw = row.raw_data as RawProspect
      const enrichmentData = await enrichProspect(raw)
      const scoring = await scorePatrimony(enrichmentData)

      const { error: updateError } = await supabase
        .from('prospection_persons_cache')
        .update({
          enrichment_data: { ...enrichmentData, raison_principale: scoring.raison_principale },
          patrimony_score: scoring.score,
          last_enriched_at: new Date().toISOString(),
        })
        .eq('canonical_key', row.canonical_key)

      if (updateError) {
        throw new Error(`update failed for ${row.canonical_key}: ${updateError.message}`)
      }
    }),
  )

  const succeeded = results.filter((r) => r.status === 'fulfilled').length
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error('[refresh-persons-cache] failed:', stale[i].canonical_key, r.reason)
    }
  })
  return { refreshed: succeeded, total: stale.length }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized()
  try {
    const result = await runRefresh()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

// Allow POST too for parity with manual `curl -X POST`
export async function POST(req: NextRequest) {
  return GET(req)
}
