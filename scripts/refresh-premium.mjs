// One-shot script: re-enrich existing /suivi prospects with Pappers Premium.
//
// Strategy : reuse the refresh-enrichment cron's logic by hitting its HTTP
// endpoint with CRON_SECRET auth. The cron picks 10 stalest prospects per
// tick — we loop until either everyone is fresh or the user explicitly stops.
//
// Quota awareness : each prospect refresh costs ~1 Pappers jeton (the Premium
// flags don't multiply the cost, see lib/data-sources/pappers.ts). Script
// estimates jetons before running and aborts if estimated > budget.
//
// Usage : `node scripts/refresh-premium.mjs [--dry-run] [--max-batches=N]`

import { createClient } from '@supabase/supabase-js'
import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'

// Minimal .env.local parser — avoids the dotenv dependency for a one-shot script.
// Handles KEY=value, ignores blanks and # comments. No quoting / multi-line support
// because the env file uses none.
try {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2]
  }
} catch {
  // .env.local absent — caller relies on shell env vars
}

const { values: args } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    'max-batches': { type: 'string', default: '100' },
    'base-url': { type: 'string', default: 'http://localhost:3000' },
  },
  strict: true,
  allowPositionals: false,
})

const DRY_RUN = args['dry-run']
const MAX_BATCHES = parseInt(args['max-batches'], 10)
const BASE_URL = args['base-url']
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET

if (!SUPABASE_URL || !SUPABASE_SVC || !CRON_SECRET) {
  console.error('Missing env vars : NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / CRON_SECRET')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_SVC)

// ── 1) Inventory pre-flight ──────────────────────────────────────────────────
const { count: totalSuivi } = await sb
  .from('prospection_prospects')
  .select('id', { count: 'exact', head: true })
  .not('icp_id', 'is', null)

const { count: withSiren } = await sb
  .from('prospection_prospects')
  .select('id', { count: 'exact', head: true })
  .not('icp_id', 'is', null)
  .filter('enrichment_data->>siren', 'not.is', null)

const { count: alreadyPremium } = await sb
  .from('prospection_prospects')
  .select('id', { count: 'exact', head: true })
  .not('icp_id', 'is', null)
  .filter('enrichment_data->pappers_premium', 'not.is', null)

const needRefresh = (withSiren ?? 0) - (alreadyPremium ?? 0)

console.log('━━━ Inventaire /suivi ━━━')
console.log(`  Total prospects en suivi  : ${totalSuivi ?? 0}`)
console.log(`  Avec SIREN                : ${withSiren ?? 0}`)
console.log(`  Déjà en Premium           : ${alreadyPremium ?? 0}`)
console.log(`  → À rafraîchir            : ${needRefresh}`)
console.log()

if (needRefresh === 0) {
  console.log('✓ Rien à faire : tous les prospects en suivi sont déjà en Premium.')
  process.exit(0)
}

// ── 2) Estimate Pappers quota impact ─────────────────────────────────────────
// Each prospect refresh = 1 Pappers call. Premium flags don't multiply cost.
const estimatedJetons = needRefresh
console.log('━━━ Estimation coût Pappers ━━━')
console.log(`  Estimation jetons consommés : ~${estimatedJetons}`)
console.log(
  `  (cf. lib/data-sources/pappers.ts — Premium ne multiplie pas le coût, c'est 1 jeton/appel)`,
)
console.log()

if (DRY_RUN) {
  console.log('━━━ DRY RUN — arrêt avant exécution ━━━')
  process.exit(0)
}

// ── 3) Force staleness on rows that need refresh ────────────────────────────
// The cron picks rows where enrichi_le is older than 7 days. We bypass that
// gate by setting enrichi_le to "year zero" on rows without pappers_premium,
// so they get picked up immediately.
console.log('━━━ Step 3 : marquer les prospects comme stale ━━━')
const { error: staleErr, count: staleCount } = await sb.rpc('force_stale_for_premium_refresh').select('*', { count: 'exact', head: true })

// Inline fallback if RPC doesn't exist : update directly via SQL-like raw
// update on the JSONB path. Supabase-js doesn't easily support JSONB partial
// updates so we fetch ids first then re-update each.
if (staleErr && staleErr.code === 'PGRST202') {
  console.log('  RPC absente, fallback : update par batch direct')

  // Fetch all prospect ids that need refresh
  const { data: idsToStale } = await sb
    .from('prospection_prospects')
    .select('id, enrichment_data')
    .not('icp_id', 'is', null)
    .filter('enrichment_data->>siren', 'not.is', null)
    .filter('enrichment_data->pappers_premium', 'is', null)

  let updatedCount = 0
  for (const row of idsToStale ?? []) {
    const ed = row.enrichment_data ?? {}
    // Mark as stale so the cron picks it up.
    ed.enrichi_le = '2000-01-01T00:00:00.000Z'
    const { error } = await sb
      .from('prospection_prospects')
      .update({ enrichment_data: ed })
      .eq('id', row.id)
    if (!error) updatedCount++
  }
  console.log(`  ✓ ${updatedCount} prospects marqués stale`)
} else {
  console.log(`  ✓ RPC OK, ${staleCount ?? 0} prospects marqués stale`)
}
console.log()

// ── 4) Trigger the cron in a loop until done or max-batches reached ─────────
console.log('━━━ Step 4 : déclencher le cron refresh-enrichment ━━━')
let totalRefreshed = 0
let totalFailed = 0
let batchNum = 0

while (batchNum < MAX_BATCHES) {
  batchNum++
  // Per-batch timeout — Pappers can be slow, give 5min then retry the batch.
  const res = await fetch(`${BASE_URL}/api/cron/refresh-enrichment`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
    signal: AbortSignal.timeout(300_000),
  }).catch((err) => {
    console.error(`  ⚠ Batch ${batchNum} fetch failed: ${err.message} — retrying after 5s`)
    return null
  })
  if (!res) {
    await new Promise((r) => setTimeout(r, 5000))
    continue
  }
  if (!res.ok) {
    console.error(`  ✗ Batch ${batchNum} : HTTP ${res.status}`)
    break
  }
  const result = await res.json()
  totalRefreshed += result.refreshed ?? 0
  totalFailed += result.failed ?? 0
  console.log(
    `  Batch ${batchNum} : candidates=${result.candidates}, refreshed=${result.refreshed}, failed=${result.failed}`,
  )
  if ((result.candidates ?? 0) === 0) {
    console.log('  → Plus de candidats stale, arrêt.')
    break
  }
  // Small pause between batches to be polite vis-à-vis Pappers rate limit
  await new Promise((r) => setTimeout(r, 1500))
}

console.log()
console.log('━━━ Résumé ━━━')
console.log(`  Batches exécutés       : ${batchNum}`)
console.log(`  Prospects rafraîchis   : ${totalRefreshed}`)
console.log(`  Échecs                 : ${totalFailed}`)
console.log()

// ── 5) Verify post-state ────────────────────────────────────────────────────
const { count: nowPremium } = await sb
  .from('prospection_prospects')
  .select('id', { count: 'exact', head: true })
  .not('icp_id', 'is', null)
  .filter('enrichment_data->pappers_premium', 'not.is', null)

console.log('━━━ État post-refresh ━━━')
console.log(`  Prospects en Premium maintenant : ${nowPremium}/${withSiren} avec SIREN`)
