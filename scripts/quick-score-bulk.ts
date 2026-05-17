#!/usr/bin/env node
/**
 * quick-score-bulk.ts — Score patrimonial initial sur toutes les personnes raw.
 *
 * Appelle POST /api/admin/quick-score en boucle.
 * 500 personnes/passe, ~1-2s par passe (aucun appel API externe).
 * ~492k personnes → ~1000 passes → ~20-30 min.
 *
 * Conserve enrichment_level='raw' : le cron Claude enrichira ensuite en profondeur.
 *
 * Usage :
 *   npx tsx scripts/quick-score-bulk.ts
 *   npx tsx scripts/quick-score-bulk.ts --dry-run
 */

import * as fs from 'fs'
import * as path from 'path'

function loadEnv(): Record<string, string> {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return {}
  return Object.fromEntries(
    fs.readFileSync(envPath, 'utf8')
      .split('\n')
      .filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => {
        const idx = l.indexOf('=')
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
      })
  )
}

async function runPass(baseUrl: string, adminKey: string): Promise<{ scored: number; done: boolean }> {
  const res = await fetch(`${baseUrl}/api/admin/quick-score`, {
    method: 'POST',
    headers: { 'x-admin-key': adminKey, 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    console.error(`\nHTTP ${res.status}:`, await res.text())
    return { scored: 0, done: true }
  }
  return res.json() as Promise<{ scored: number; done: boolean }>
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  const env = loadEnv()
  const baseUrl = env.INGEST_BASE_URL ?? 'https://charlie-prospection.vercel.app'
  const adminKey = env.ADMIN_API_KEY ?? ''

  if (!adminKey) { console.error('❌ ADMIN_API_KEY manquant'); process.exit(1) }

  console.log('=== Quick Score Bulk ===')
  console.log(`  URL : ${baseUrl}`)
  console.log('  500 personnes/passe — scoring règles métier, aucun appel API externe')
  if (dryRun) { console.log('  Mode dry-run — test d\'une seule passe'); }

  let totalScored = 0
  let passes = 0
  const startAt = Date.now()

  while (true) {
    passes++
    const { scored, done } = await runPass(baseUrl, adminKey)
    totalScored += scored

    const elapsed = ((Date.now() - startAt) / 1000).toFixed(0)
    const perMin = passes > 1 ? Math.round(totalScored / ((Date.now() - startAt) / 60000)) : '?'
    process.stdout.write(
      `\r  Passe ${passes} | Scorées: ${totalScored.toLocaleString('fr')} | ${perMin}/min | ${elapsed}s   `
    )

    if (done || dryRun) {
      console.log(done ? '\n  Toutes les personnes scorées.' : '\n  Dry-run terminé.')
      break
    }

    await sleep(500)
  }

  const elapsed = ((Date.now() - startAt) / 1000).toFixed(0)
  console.log(`\n=== Terminé — ${totalScored.toLocaleString('fr')} personnes scorées en ${elapsed}s ===`)
}

main().catch(e => { console.error(e); process.exit(1) })
