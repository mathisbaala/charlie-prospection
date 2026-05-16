import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { parseRppsCsvLine } from './parse'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const RPPS_DATASET_ID = '53699613a3a729239d2048e3'
const DATAGOUV_API = 'https://www.data.gouv.fr/api/1'
const BATCH_SIZE = 500

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

async function getLatestRppsUrl(): Promise<string> {
  const res = await fetch(`${DATAGOUV_API}/datasets/${RPPS_DATASET_ID}/`, {
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`data.gouv.fr API error: ${res.status}`)
  const dataset = await res.json()
  const resources: Array<{ url: string; format?: string; filesize?: number }> =
    dataset.resources ?? []
  const csv = resources
    .filter((r) => r.format?.toLowerCase() === 'csv' || r.url?.endsWith('.csv'))
    .sort((a, b) => (b.filesize ?? 0) - (a.filesize ?? 0))[0]
  if (!csv) throw new Error('No CSV resource found in RPPS dataset')
  return csv.url
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let csvUrl: string
  try {
    csvUrl = await getLatestRppsUrl()
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }

  const csvRes = await fetch(csvUrl, { cache: 'no-store' })
  if (!csvRes.ok || !csvRes.body) {
    return NextResponse.json({ error: 'Failed to download RPPS CSV' }, { status: 500 })
  }

  const reader = csvRes.body.getReader()
  const decoder = new TextDecoder('utf-8')

  let buffer = ''
  let headers: string[] | null = null
  let batch: Record<string, unknown>[] = []
  let totalInserted = 0
  let totalSkipped = 0

  async function flushBatch() {
    if (!batch.length) return
    await supabase
      .from('prospection_rpps_cache')
      .upsert(batch as never[], { onConflict: 'rpps_id' })
    totalInserted += batch.length
    batch = []
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue

      if (!headers) {
        // Strip BOM if present
        headers = line.split(';').map((h) => h.trim().replace(/^﻿/, ''))
        continue
      }

      const row = parseRppsCsvLine(line, headers)
      if (!row) {
        totalSkipped++
        continue
      }

      batch.push({ ...row, updated_at: new Date().toISOString() })
      if (batch.length >= BATCH_SIZE) await flushBatch()
    }
  }

  if (buffer.trim() && headers) {
    const row = parseRppsCsvLine(buffer.trim(), headers)
    if (row) batch.push({ ...row, updated_at: new Date().toISOString() })
  }
  await flushBatch()

  return NextResponse.json({
    ok: true,
    inserted: totalInserted,
    skipped: totalSkipped,
    source_url: csvUrl,
  })
}
