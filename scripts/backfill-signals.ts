/**
 * One-shot backfill: for every existing prospect with a SIREN, import up to 1
 * year of past signals from prospection_signals_inbox into prospection_signals.
 *
 * Run AFTER migration 20260516010000_signal_per_prospect.sql is applied.
 * Idempotent — the unique index on (prospect_id, source, type, detected_at)
 * dedupes any prior partial run.
 *
 * Usage:
 *   npx tsx scripts/backfill-signals.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env
 * (already in .env.local for prod operations).
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadDotEnv() {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
    for (const line of content.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  } catch {
    // ignore — running in an env where vars are already set
  }
}

interface ProspectRow {
  id: string
  org_id: string
  enrichment_data: { siren?: string } & Record<string, unknown>
}

async function main() {
  loadDotEnv()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  // Paginate through prospects to avoid loading everything in memory.
  const pageSize = 200
  let from = 0
  let totalProcessed = 0
  let totalInserted = 0
  let totalSkipped = 0

  console.log('[backfill-signals] starting…')

  while (true) {
    const { data: prospects, error } = await supabase
      .from('prospection_prospects')
      .select('id, org_id, enrichment_data')
      .range(from, from + pageSize - 1)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[backfill-signals] fetch failed:', error.message)
      process.exit(1)
    }
    if (!prospects || prospects.length === 0) break

    for (const p of prospects as ProspectRow[]) {
      const siren = p.enrichment_data?.siren
      if (!siren || typeof siren !== 'string' || siren.length < 9) {
        totalSkipped += 1
        continue
      }

      const { data: count, error: rpcErr } = await supabase.rpc(
        'backfill_signals_for_prospect_v2',
        { p_prospect_id: p.id, p_org_id: p.org_id, p_sirens: [siren] },
      )
      if (rpcErr) {
        console.error(`[backfill-signals] RPC failed for ${p.id}:`, rpcErr.message)
        continue
      }
      const inserted = typeof count === 'number' ? count : 0
      totalInserted += inserted
      totalProcessed += 1
      if (totalProcessed % 25 === 0) {
        console.log(
          `[backfill-signals] processed=${totalProcessed} inserted=${totalInserted} skipped=${totalSkipped}`,
        )
      }
    }

    if (prospects.length < pageSize) break
    from += pageSize
  }

  console.log(
    `[backfill-signals] done — processed=${totalProcessed} inserted=${totalInserted} skipped_no_siren=${totalSkipped}`,
  )
}

main().catch((err) => {
  console.error('[backfill-signals] unexpected error:', err)
  process.exit(1)
})
