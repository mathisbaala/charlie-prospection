#!/usr/bin/env node
/**
 * enrich-bulk.ts — Déclenche manuellement l'enrichissement standard en masse.
 *
 * Appelle le cron /api/cron/enrich-persons-standard en boucle (étape 2 du pipeline),
 * 50 personnes par passe, jusqu'à épuisement des entrées 'raw' de plus de 24h.
 *
 * Sources : Annuaire Entreprises (gratuit) + BODACC (gratuit) + score règles métier.
 * Zéro Pappers, zéro Claude. À utiliser pour un backfill urgent entre deux runs
 * du cron quotidien (08:00 UTC).
 *
 * Usage :
 *   npx tsx scripts/enrich-bulk.ts
 *   npx tsx scripts/enrich-bulk.ts --max 500     # limiter à 500 personnes
 *   npx tsx scripts/enrich-bulk.ts --delay 3000  # délai entre passes (ms)
 *   npx tsx scripts/enrich-bulk.ts --dry-run     # compte les 'raw' sans enrichir
 *
 * Env :
 *   INGEST_BASE_URL   URL de l'app (défaut https://charlie-prospection.vercel.app)
 *   CRON_SECRET       Secret du cron (dans .env.local)
 */

import * as fs from 'fs'
import * as path from 'path'

const BATCH_SIZE = 50

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

async function countRaw(baseUrl: string, adminKey: string): Promise<number> {
  const res = await fetch(`${baseUrl}/api/admin/ingest/persons`, {
    headers: { 'x-admin-key': adminKey },
  })
  if (!res.ok) return -1
  const data = await res.json() as { count: number }
  return data.count
}

async function runEnrichPass(baseUrl: string, cronSecret: string): Promise<{
  enriched: number
  errors: number
  done: boolean
}> {
  const res = await fetch(`${baseUrl}/api/cron/enrich-persons-standard`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  })
  if (!res.ok) {
    console.error(`  HTTP ${res.status}:`, await res.text())
    return { enriched: 0, errors: 0, done: true }
  }
  const data = await res.json() as { enriched: number; errors: number; done: boolean }
  return { enriched: data.enriched, errors: data.errors ?? 0, done: data.done }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const maxPersons = args.includes('--max')
    ? parseInt(args[args.indexOf('--max') + 1], 10)
    : Infinity
  const delayMs = args.includes('--delay')
    ? parseInt(args[args.indexOf('--delay') + 1], 10)
    : 2000

  const env = loadEnv()
  const baseUrl = env.INGEST_BASE_URL ?? 'https://charlie-prospection.vercel.app'
  const cronSecret = env.CRON_SECRET ?? ''
  const adminKey = env.ADMIN_API_KEY ?? ''

  if (!cronSecret) {
    console.error('❌ CRON_SECRET manquant dans .env.local')
    process.exit(1)
  }

  console.log('=== Bulk Enrichment Standard (étape 2) ===')
  console.log(`  URL : ${baseUrl}`)
  console.log(`  Sources : Annuaire Entreprises + BODACC (gratuit, zéro Pappers)`)
  console.log(`  Délai entre passes : ${delayMs}ms`)
  if (maxPersons !== Infinity) console.log(`  Max personnes : ${maxPersons}`)
  if (dryRun) console.log('  Mode dry-run')

  if (dryRun || adminKey) {
    const count = await countRaw(baseUrl, adminKey)
    if (count >= 0) console.log(`  Entrées 'raw' en base : ${count.toLocaleString('fr')}`)
    if (dryRun) return
  }

  let totalEnriched = 0
  let totalErrors = 0
  let passes = 0
  const startAt = Date.now()

  while (totalEnriched + totalErrors < maxPersons) {
    passes++
    const { enriched, errors, done } = await runEnrichPass(baseUrl, cronSecret)
    totalEnriched += enriched
    totalErrors += errors

    const elapsed = ((Date.now() - startAt) / 1000).toFixed(0)
    process.stdout.write(
      `\r  Passe ${passes} | Enrichies: ${totalEnriched} | Erreurs: ${totalErrors} | ${elapsed}s   `
    )

    if (done) {
      console.log('\n  Queue épuisée (toutes les raw > 24h sont standard).')
      break
    }

    await sleep(delayMs)
  }

  const elapsed = ((Date.now() - startAt) / 1000).toFixed(0)
  console.log(`\n\n=== Terminé ===`)
  console.log(`  Passes : ${passes} | Enrichies : ${totalEnriched} | Erreurs : ${totalErrors}`)
  console.log(`  Durée : ${elapsed}s`)
}

main().catch((e) => { console.error(e); process.exit(1) })
