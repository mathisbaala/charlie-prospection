import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import {
  fetchInpiDailyDiff,
  mapInpiTypeToEvent,
  probeInpi,
  type InpiFormality,
} from '@/lib/data-sources/inpi'
import type { SignalsInboxInsert } from '@/lib/types'

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

function extractDeptFromCp(cp: string | undefined | null): string | null {
  if (!cp) return null
  const cleaned = cp.replace(/\s+/g, '')
  if (/^20\d{3}$/.test(cleaned)) {
    const n = parseInt(cleaned.slice(0, 3), 10)
    return n <= 201 ? '2A' : '2B'
  }
  const m = cleaned.match(/^(\d{2,3})/)
  if (!m) return null
  return m[1].startsWith('97') ? m[1] : m[1].slice(0, 2)
}

/** Build a signals_inbox row from a single INPI formality. Exported for tests. */
export function buildInpiInboxRow(f: InpiFormality): SignalsInboxInsert | null {
  if (!f.id) return null
  const dateEvent = f.dateEvenement
    ? new Date(f.dateEvenement).toISOString()
    : new Date().toISOString()

  return {
    source: 'inpi',
    external_id: f.id,
    date_event: dateEvent,
    siren: f.siren ?? null,
    entreprise_nom: f.denomination ?? null,
    code_naf: f.codeAPE ? f.codeAPE.replace(/\./g, '').toUpperCase() : null,
    departement: extractDeptFromCp(f.codePostal),
    type_event: mapInpiTypeToEvent(f.typeEvenement),
    raw_data: f as unknown as Record<string, unknown>,
  }
}

interface IngestResult {
  fetched: number
  ingested: number
  skipped_duplicates: number
  skipped_invalid: number
}

async function runIngest(): Promise<IngestResult> {
  const token = process.env.INPI_API_TOKEN
  const baseUrl = process.env.INPI_API_BASE
  if (!token || !baseUrl) {
    throw new Error('INPI_API_TOKEN or INPI_API_BASE not set — cron skipped')
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const records = await fetchInpiDailyDiff({
    sinceDate,
    baseUrl,
    token,
    path: process.env.INPI_API_PATH,
  })

  const rows: SignalsInboxInsert[] = []
  let skippedInvalid = 0
  for (const f of records) {
    const row = buildInpiInboxRow(f)
    if (!row) {
      skippedInvalid += 1
      continue
    }
    rows.push(row)
  }

  if (rows.length === 0) {
    return { fetched: records.length, ingested: 0, skipped_duplicates: 0, skipped_invalid: skippedInvalid }
  }

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

async function runProbe() {
  const token = process.env.INPI_API_TOKEN
  const baseUrl = process.env.INPI_API_BASE
  if (!token || !baseUrl) {
    return { ok: false as const, skipped: true, reason: 'INPI_API_TOKEN or INPI_API_BASE not set' }
  }
  return probeInpi({ baseUrl, token, path: process.env.INPI_API_PATH })
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized()

  // Probe mode: `?probe=1` returns connection diagnostics without ingesting.
  // Used to verify INPI credentials + URL + envelope before going live.
  const url = new URL(req.url)
  if (url.searchParams.get('probe') === '1') {
    const result = await runProbe()
    return NextResponse.json(result)
  }

  try {
    const result = await runIngest()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    if (message.includes('INPI_API_TOKEN') || message.includes('INPI_API_BASE')) {
      return NextResponse.json({ ok: true, skipped: true, reason: message })
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
