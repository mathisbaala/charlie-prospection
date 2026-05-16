// Post-refresh verification : check what shape the Premium data takes across
// the 58 prospects we just refreshed. Counts signals by type and origin so
// we can confirm the miner actually ran end-to-end.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
  if (m && !line.trim().startsWith('#') && !process.env[m[1]]) {
    process.env[m[1]] = m[2]
  }
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

// ── A) Premium presence sample ──────────────────────────────────────────────
const { data: samples } = await sb
  .from('prospection_prospects')
  .select('id, enrichment_data')
  .not('icp_id', 'is', null)
  .filter('enrichment_data->pappers_premium', 'not.is', null)
  .limit(5)

console.log('━━━ Sample Premium payloads (5 prospects) ━━━')
for (const p of samples ?? []) {
  const ed = p.enrichment_data ?? {}
  const premium = ed.pappers_premium ?? {}
  const portfolio = ed.personal_portfolio ?? {}
  console.log(`  prospect ${p.id.slice(0, 8)}…`)
  console.log(`    name      : ${ed.dirigeant_prenom} ${ed.dirigeant_nom}`)
  console.log(`    siren     : ${ed.siren}`)
  console.log(`    actes     : ${(premium.depots_actes ?? []).length} dépôts`)
  console.log(`    comptes   : ${(premium.comptes ?? []).length}`)
  console.log(`    BODACC    : ${(premium.publications_bodacc ?? []).length}`)
  console.log(`    portfolio : ${portfolio.total_entites ?? 0} entités`)
  console.log(`    infogreffe: ${ed.infogreffe?.url ? 'present' : 'absent'} (fallback=${ed.infogreffe?.is_fallback ?? '—'})`)
  console.log(`    dvf perso : ${(ed.dvf_perso_candidates ?? []).length} candidats`)
}
console.log()

// ── B) Signals stats ────────────────────────────────────────────────────────
const { count: totalSignals } = await sb
  .from('prospection_signals')
  .select('id', { count: 'exact', head: true })

const { count: pappersSignals } = await sb
  .from('prospection_signals')
  .select('id', { count: 'exact', head: true })
  .eq('source', 'pappers')

const { data: byType } = await sb
  .from('prospection_signals')
  .select('type, source')
  .limit(2000)

const typeCounts = {}
const sourceCounts = {}
for (const s of byType ?? []) {
  typeCounts[s.type] = (typeCounts[s.type] ?? 0) + 1
  sourceCounts[s.source] = (sourceCounts[s.source] ?? 0) + 1
}

console.log('━━━ Signals (toutes orgs) ━━━')
console.log(`  Total                  : ${totalSignals}`)
console.log(`  Source = pappers       : ${pappersSignals}`)
console.log()
console.log('  Breakdown par source :')
for (const [src, c] of Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${src.padEnd(20)} : ${c}`)
}
console.log()
console.log('  Breakdown par type :')
for (const [t, c] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${t.padEnd(25)} : ${c}`)
}
console.log()

// ── C) Pappers signals — premium_kind check ─────────────────────────────────
const { data: pappersData } = await sb
  .from('prospection_signals')
  .select('data')
  .eq('source', 'pappers')
  .limit(1000)

const premiumKindCounts = {}
for (const row of pappersData ?? []) {
  const kind = row.data?.premium_kind ?? 'unknown'
  premiumKindCounts[kind] = (premiumKindCounts[kind] ?? 0) + 1
}
console.log('━━━ Pappers signals — premium_kind ━━━')
for (const [k, c] of Object.entries(premiumKindCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(15)} : ${c}`)
}
