#!/usr/bin/env node
/**
 * ingest-avocats-cnb.ts — Alimentation prospection_persons depuis l'API CNB.
 *
 * Source : https://annuaire.cnb.avocat.fr/api/v1/avocats
 * API publique JSON, pas de clé requise.
 * Pagination par département (code numérique = code barreau principal).
 *
 * Usage :
 *   npx tsx scripts/ingest-avocats-cnb.ts
 *   npx tsx scripts/ingest-avocats-cnb.ts --dept 75         # un département
 *   npx tsx scripts/ingest-avocats-cnb.ts --dry-run
 *
 * Env :
 *   INGEST_BASE_URL  URL de l'app Next.js (défaut : http://localhost:3000)
 *   ADMIN_API_KEY    Clé d'admin
 */

import { getEnv, postBatch, sleep, DEPTS_FRANCE } from './lib/ingest-client'
import type { PersonIngestInput } from '../lib/persons/types'

const CNB_BASE = 'https://annuaire.cnb.avocat.fr/api/v1'
const BATCH_SIZE = 500
const RATE_LIMIT_MS = 1200 // ~50 req/min, généreux

interface CnbAvocat {
  nom?: string
  prenom?: string
  barreau?: string
  cabinet?: string
  adresse?: string
  ville?: string
  code_postal?: string
  [key: string]: unknown
}

interface CnbResponse {
  data?: CnbAvocat[]
  total?: number
  per_page?: number
  current_page?: number
  last_page?: number
  // Certaines versions : tableau direct
  [key: string]: unknown
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

function mapAvocat(avocat: CnbAvocat, dept: string): PersonIngestInput | null {
  const nom = normalize(avocat.nom ?? '')
  const prenom = normalize(avocat.prenom ?? '')
  if (!nom || !prenom) return null

  return {
    prenom,
    nom,
    source: 'cnb_annuaire',
    person_type: 'avocat',
    profession_libelle: 'Avocat',
    entreprise_nom: avocat.cabinet ? normalize(avocat.cabinet) : undefined,
    departement: dept,
    ville: avocat.ville ? normalize(avocat.ville) : undefined,
    adresse: avocat.adresse ? normalize(avocat.adresse) : undefined,
    code_postal: avocat.code_postal?.trim() || undefined,
  }
}

async function fetchAvocatsDept(
  dept: string,
  page: number,
): Promise<{ avocats: CnbAvocat[]; lastPage: number }> {
  const url = `${CNB_BASE}/avocats?barreau=${dept}&page=${page}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  })

  if (res.status === 404) return { avocats: [], lastPage: 0 }
  if (!res.ok) {
    console.error(`\n[CNB] HTTP ${res.status} pour dept=${dept} page=${page}`)
    return { avocats: [], lastPage: 0 }
  }

  const body: CnbResponse = await res.json()

  // Normalise la réponse selon le format retourné
  if (Array.isArray(body)) {
    return { avocats: body as CnbAvocat[], lastPage: 1 }
  }
  if (Array.isArray(body.data)) {
    const lastPage = body.last_page ?? Math.ceil((body.total ?? 0) / (body.per_page ?? 25))
    return { avocats: body.data, lastPage: Math.max(lastPage, 1) }
  }
  // Fallback : si la structure est inconnue, on log pour debug
  if (page === 1) {
    console.warn(`\n[CNB] Format inattendu dept=${dept}:`, JSON.stringify(body).slice(0, 200))
  }
  return { avocats: [], lastPage: 0 }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const deptFilter = args.includes('--dept')
    ? [args[args.indexOf('--dept') + 1]]
    : DEPTS_FRANCE

  const env = dryRun ? { baseUrl: '', apiKey: 'dry-run' } : getEnv()

  console.log('=== Ingest Avocats CNB ===')
  console.log(`  Départements : ${deptFilter.length === 1 ? deptFilter[0] : `${deptFilter.length} depts`}`)
  if (dryRun) console.log('  Mode dry-run : pas de POST')

  let batch: PersonIngestInput[] = []
  let totalUpserted = 0
  let totalErrors = 0
  let totalSkipped = 0
  const startAt = Date.now()

  for (const dept of deptFilter) {
    let page = 1
    let lastPage = 1

    do {
      const { avocats, lastPage: lp } = await fetchAvocatsDept(dept, page)
      lastPage = lp
      await sleep(RATE_LIMIT_MS)

      for (const avocat of avocats) {
        const person = mapAvocat(avocat, dept)
        if (!person) { totalSkipped++; continue }

        if (dryRun) {
          if (totalUpserted < 5) console.log('  DRY:', JSON.stringify(person))
          totalUpserted++
          continue
        }

        batch.push(person)
        if (batch.length >= BATCH_SIZE) {
          const r = await postBatch(batch, env.baseUrl, env.apiKey)
          totalUpserted += r.upserted
          totalErrors += r.errors
          batch = []
          await sleep(RATE_LIMIT_MS)
        }
      }

      const elapsed = ((Date.now() - startAt) / 1000).toFixed(0)
      process.stdout.write(
        `\r  Dept ${dept} page ${page}/${lastPage} | Upserted: ${totalUpserted} | Errors: ${totalErrors} | ${elapsed}s  `,
      )
      page++
    } while (page <= lastPage)
  }

  // Flush dernier batch
  if (!dryRun && batch.length) {
    const r = await postBatch(batch, env.baseUrl, env.apiKey)
    totalUpserted += r.upserted
    totalErrors += r.errors
  }

  const elapsed = ((Date.now() - startAt) / 1000).toFixed(0)
  console.log('\n\n=== Terminé ===')
  console.log(`  Upserted : ${totalUpserted} | Errors : ${totalErrors} | Ignorés : ${totalSkipped}`)
  console.log(`  Durée : ${elapsed}s`)
}

main().catch((e) => { console.error(e); process.exit(1) })
