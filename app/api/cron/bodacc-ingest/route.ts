import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import {
  classifyBodaccEvent,
  extractDepartementFromCp,
  extractSirenFromRegistre,
  fetchRecentBodaccAnnouncements,
  type BodaccRecord,
} from '@/lib/data-sources/bodacc'
import type { InboxEventType, SignalsInboxInsert } from '@/lib/types'

// Cron should never be statically optimised; we always re-run it.
export const dynamic = 'force-dynamic'
// Cron runs are short and bursty — give them room.
export const maxDuration = 300

function unauthorized() {
  return new NextResponse('Unauthorized', { status: 401 })
}

function isAuthorized(req: NextRequest): boolean {
  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically when the
  // env var is set. We also accept the same header when called manually.
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization') ?? ''
  return header === `Bearer ${secret}`
}

function buildInboxRow(record: BodaccRecord): SignalsInboxInsert | null {
  if (!record.id) return null
  const eventType = classifyBodaccEvent(record) as InboxEventType
  const dateEvent = record.dateparution
    ? new Date(record.dateparution).toISOString()
    : new Date().toISOString()

  return {
    source: 'bodacc',
    external_id: record.id,
    date_event: dateEvent,
    siren: extractSirenFromRegistre(record.registre),
    entreprise_nom: record.commercant ?? null,
    code_naf: null, // BODACC does not publish NAF directly; matching falls back to free-text
    departement: record.numerodepartement ?? extractDepartementFromCp(record.cp),
    type_event: eventType,
    raw_data: record as unknown as Record<string, unknown>,
  }
}

async function runIngest(): Promise<{
  fetched: number
  ingested: number
  skipped_duplicates: number
  skipped_invalid: number
}> {
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Last 24h, formatted YYYY-MM-DD for BODACC's date filter
  const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const records = await fetchRecentBodaccAnnouncements({ sinceDate, maxRecords: 1000 })

  const rows: SignalsInboxInsert[] = []
  let skippedInvalid = 0
  for (const rec of records) {
    const row = buildInboxRow(rec)
    if (!row) {
      skippedInvalid += 1
      continue
    }
    rows.push(row)
  }

  if (rows.length === 0) {
    return { fetched: records.length, ingested: 0, skipped_duplicates: 0, skipped_invalid: skippedInvalid }
  }

  // Insert with ON CONFLICT DO NOTHING via upsert + ignoreDuplicates
  const { data, error } = await supabase
    .from('prospection_signals_inbox')
    .upsert(rows, { onConflict: 'source,external_id', ignoreDuplicates: true })
    .select('id')

  if (error) {
    throw new Error(`signals_inbox upsert failed: ${error.message}`)
  }

  const ingested = data?.length ?? 0
  return {
    fetched: records.length,
    ingested,
    skipped_duplicates: rows.length - ingested,
    skipped_invalid: skippedInvalid,
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized()
  try {
    const result = await runIngest()
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
