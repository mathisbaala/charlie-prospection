#!/usr/bin/env node
/**
 * update-rpps-sectors.ts — Enrichit les scores patrimoniaux des médecins
 * avec leur secteur conventionnel (1/2/3/Optam) depuis le fichier RPPS.
 *
 * Sources :
 *   - Même fichier RPPS que ingest-rpps-bulk.ts (data.gouv.fr, ~200 MB)
 *   - Extrait : Identifiant PP + Libellé type activité libérale
 *
 * Impact :
 *   Secteur 2 → +12 pts | Optam-CO → +10 pts | Secteur 3 → +8 pts | Optam → +6 pts
 *   Secteur 1 ou inconnu → aucun changement
 *
 * Prérequis : enrich-persons-standard déjà passé (patrimony_score IS NOT NULL)
 *
 * Usage :
 *   npx tsx scripts/update-rpps-sectors.ts
 *   npx tsx scripts/update-rpps-sectors.ts --dry-run
 */

import * as fs from 'fs'
import * as path from 'path'

const RPPS_DATASET_ID = '69025e6c73d1f9b79ca3c365'
const DATAGOUV_API = 'https://www.data.gouv.fr/api/1'
const BATCH_SIZE = 500
const RATE_LIMIT_MS = 500

function loadEnv(): Record<string, string> {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return {}
  return Object.fromEntries(
    fs.readFileSync(envPath, 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const idx = l.indexOf('=')
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
      }),
  )
}

async function getLatestRppsUrl(): Promise<string> {
  const res = await fetch(`${DATAGOUV_API}/datasets/${RPPS_DATASET_ID}/`)
  if (!res.ok) throw new Error(`data.gouv.fr API error: ${res.status}`)
  const dataset = await res.json() as { resources?: Array<{ url: string; format?: string; filesize?: number }> }
  const resources = dataset.resources ?? []
  const candidates = resources
    .filter(
      (r) =>
        r.url?.includes('personne-activite') ||
        r.url?.endsWith('.txt') ||
        r.format?.toLowerCase() === 'txt',
    )
    .sort((a, b) => (b.filesize ?? 0) - (a.filesize ?? 0))
  if (!candidates.length) throw new Error('Aucun fichier TXT trouvé dans le dataset RPPS')
  console.log(`  Taille: ${((candidates[0].filesize ?? 0) / 1e6).toFixed(0)} MB`)
  return candidates[0].url
}

function detectDelimiter(headerLine: string): '|' | ';' {
  const pipes = (headerLine.match(/\|/g) ?? []).length
  const semis = (headerLine.match(/;/g) ?? []).length
  return pipes >= semis ? '|' : ';'
}

async function postSectorBatch(
  updates: Array<{ rpps_number: string; secteur: string }>,
  baseUrl: string,
  adminKey: string,
): Promise<{ updated: number }> {
  if (!updates.length) return { updated: 0 }
  try {
    const res = await fetch(`${baseUrl}/api/admin/rpps-sector-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ updates }),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error(`\n[sector] HTTP ${res.status}: ${text.slice(0, 300)}`)
      return { updated: 0 }
    }
    return res.json() as Promise<{ updated: number }>
  } catch (e) {
    console.error('\n[sector] fetch error:', String(e))
    return { updated: 0 }
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  const env = loadEnv()
  const baseUrl = env.INGEST_BASE_URL ?? 'https://charlie-prospection.vercel.app'
  const adminKey = env.ADMIN_API_KEY ?? ''

  if (!adminKey && !dryRun) {
    console.error('❌ ADMIN_API_KEY manquant dans .env.local')
    process.exit(1)
  }

  console.log('=== RPPS Sector Update ===')
  console.log(`  URL : ${baseUrl}`)
  console.log('  Bonus secteur 2 → +12 | Optam-CO → +10 | Secteur 3 → +8 | Optam → +6')
  if (dryRun) console.log('  Mode dry-run — pas de POST')

  console.log('\nRécupération URL dataset RPPS...')
  const url = await getLatestRppsUrl()
  console.log(`  URL : ...${url.slice(-60)}`)

  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Échec téléchargement RPPS : ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')

  let buffer = ''
  let headers: string[] | null = null
  let delimiter: '|' | ';' = '|'
  let batch: Array<{ rpps_number: string; secteur: string }> = []
  let totalUpdated = 0
  let totalSkipped = 0
  let lineCount = 0
  let withSector = 0
  const startAt = Date.now()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const rawLine of lines) {
      const line = rawLine.trim().replace(/\r$/, '')
      if (!line) continue
      lineCount++

      if (!headers) {
        const clean = line.replace(/^﻿/, '')
        delimiter = detectDelimiter(clean)
        headers = clean.split(delimiter).map((h) => h.trim())
        console.log(`  Délimiteur : "${delimiter}" | ${headers.length} colonnes`)
        continue
      }

      const fields = line.split(delimiter)
      const get = (...names: string[]): string => {
        for (const name of names) {
          const idx = headers!.indexOf(name)
          if (idx >= 0) return (fields[idx] ?? '').trim()
        }
        return ''
      }

      // Filtre mode libéral uniquement
      const mode = get('Code mode exercice', "Code mode d'exercice")
      if (mode !== 'L') { totalSkipped++; continue }

      const rpps = get('Identifiant PP', 'N° RPPS')
      if (!rpps) { totalSkipped++; continue }

      const secteur = get(
        'Libellé type activité libérale',
        'Libelle type activite liberale',
        'Type Activite Liberale Libelle',
      )
      if (!secteur) { totalSkipped++; continue }

      withSector++

      if (dryRun) {
        if (withSector <= 5) {
          console.log(`  DRY: rpps=${rpps} secteur="${secteur}"`)
        }
        continue
      }

      batch.push({ rpps_number: rpps, secteur })

      if (batch.length >= BATCH_SIZE) {
        const { updated } = await postSectorBatch(batch, baseUrl, adminKey)
        totalUpdated += updated
        batch = []
        await sleep(RATE_LIMIT_MS)
        const elapsed = ((Date.now() - startAt) / 1000).toFixed(0)
        process.stdout.write(
          `\r  Lignes: ${lineCount.toLocaleString('fr')} | Avec secteur: ${withSector.toLocaleString('fr')} | Mis à jour: ${totalUpdated.toLocaleString('fr')} | ${elapsed}s  `,
        )
      }
    }
  }

  // Flush dernière ligne
  if (buffer.trim() && headers) {
    const fields = buffer.trim().split(delimiter)
    const get = (...names: string[]) => {
      for (const name of names) {
        const idx = headers!.indexOf(name)
        if (idx >= 0) return (fields[idx] ?? '').trim()
      }
      return ''
    }
    const mode = get('Code mode exercice', "Code mode d'exercice")
    const rpps = get('Identifiant PP', 'N° RPPS')
    const secteur = get('Libellé type activité libérale', 'Libelle type activite liberale')
    if (mode === 'L' && rpps && secteur) batch.push({ rpps_number: rpps, secteur })
  }

  if (!dryRun && batch.length) {
    const { updated } = await postSectorBatch(batch, baseUrl, adminKey)
    totalUpdated += updated
  }

  const elapsed = ((Date.now() - startAt) / 1000).toFixed(0)
  console.log('\n\n=== Terminé ===')
  console.log(`  Lignes traitées : ${lineCount.toLocaleString('fr')}`)
  console.log(`  Avec secteur : ${withSector.toLocaleString('fr')} | Mis à jour en DB : ${totalUpdated.toLocaleString('fr')}`)
  console.log(`  Durée : ${elapsed}s`)
  if (dryRun) console.log('\n  Dry-run terminé — aucune écriture.')
}

main().catch((e) => { console.error(e); process.exit(1) })
