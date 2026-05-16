#!/usr/bin/env node
/**
 * seed-rpps.ts — one-shot script to populate prospection_rpps_cache
 * Run: npx tsx scripts/seed-rpps.ts
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://omowryysuqejtmfhwmmf.supabase.co'
const SUPABASE_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tb3dyeXlzdXFlanRtZmh3bW1mIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjEyMTIwNywiZXhwIjoyMDkxNjk3MjA3fQ.sSiRZYYm8LE2VXHWnJtwomi10VoQtBhr2v_mTLu3LC8'

const RPPS_DATASET_ID = '69025e6c73d1f9b79ca3c365'
const DATAGOUV_API = 'https://www.data.gouv.fr/api/1'
const BATCH_SIZE = 500
const PROFESSIONS_CIBLES = ['Médecin', 'Chirurgien-Dentiste']

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function getLatestRppsUrl(): Promise<string> {
  const res = await fetch(`${DATAGOUV_API}/datasets/${RPPS_DATASET_ID}/`, { cache: 'no-store' as RequestCache })
  if (!res.ok) throw new Error(`data.gouv.fr API error: ${res.status}`)
  const dataset = await res.json()
  const resources: Array<{ url: string; format?: string; filesize?: number; title?: string }> =
    dataset.resources ?? []
  console.log(`Found ${resources.length} resources`)
  resources.forEach((r, i) => console.log(`  [${i}] format=${r.format} size=${r.filesize} url=${r.url?.slice(-60)}`))
  const txt = resources
    .filter(
      (r) =>
        r.url?.includes('personne-activite') ||
        r.url?.endsWith('.txt') ||
        r.format?.toLowerCase() === 'txt',
    )
    .sort((a, b) => (b.filesize ?? 0) - (a.filesize ?? 0))[0]
  if (!txt) throw new Error('No TXT resource found in RPPS dataset')
  return txt.url
}

function parseLine(
  line: string,
  headers: string[],
): Record<string, string | null> | null {
  const fields = line.split('|')
  const get = (colName: string): string => {
    const idx = headers.indexOf(colName)
    return idx >= 0 ? (fields[idx] ?? '').trim() : ''
  }

  const rpps_id = get('Identifiant PP')
  if (!rpps_id) return null

  const mode_exercice = get('Code mode exercice')
  if (mode_exercice !== 'L') return null

  const profession = get('Libellé profession')
  if (!PROFESSIONS_CIBLES.some((p) => profession.includes(p))) return null

  return {
    rpps_id,
    nom: get("Nom d'exercice") || rpps_id,
    prenom: get("Prénom d'exercice") || null,
    profession,
    specialite: get('Libellé catégorie professionnelle') || null,
    mode_exercice,
    ville: get('Libellé commune (coord. structure)') || null,
    code_postal: get('Code postal (coord. structure)') || null,
    updated_at: new Date().toISOString(),
  }
}

async function flushBatch(batch: Record<string, string | null>[]): Promise<number> {
  if (!batch.length) return 0
  // Deduplicate within batch — same rpps_id can appear multiple times (multiple activities)
  const deduped = Object.values(
    Object.fromEntries(batch.map((r) => [r.rpps_id, r])),
  )
  const { error } = await supabase
    .from('prospection_rpps_cache')
    .upsert(deduped as never[], { onConflict: 'rpps_id' })
  if (error) {
    console.error('Upsert error:', error.message)
    return 0
  }
  return deduped.length
}

async function main() {
  console.log('Fetching RPPS dataset metadata...')
  const url = await getLatestRppsUrl()
  console.log(`Streaming: ${url}`)

  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Failed to download: ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')

  let buffer = ''
  let headers: string[] | null = null
  let batch: Record<string, string | null>[] = []
  let totalInserted = 0
  let totalSkipped = 0
  let lineCount = 0
  const startAt = Date.now()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue
      lineCount++

      if (!headers) {
        headers = line.split('|').map((h) => h.trim().replace(/^﻿/, ''))
        console.log(`Headers (${headers.length}): ${headers.slice(0, 6).join(' | ')} ...`)
        continue
      }

      const row = parseLine(line, headers)
      if (!row) {
        totalSkipped++
        continue
      }

      batch.push(row)
      if (batch.length >= BATCH_SIZE) {
        const n = await flushBatch(batch)
        totalInserted += n
        batch = []
        const elapsed = ((Date.now() - startAt) / 1000).toFixed(0)
        process.stdout.write(`\r  Lines: ${lineCount} | Inserted: ${totalInserted} | Skipped: ${totalSkipped} | ${elapsed}s`)
      }
    }
  }

  // Last partial line
  if (buffer.trim() && headers) {
    const row = parseLine(buffer.trim(), headers)
    if (row) batch.push(row)
  }
  totalInserted += await flushBatch(batch)

  console.log(`\n\nDone. Lines: ${lineCount} | Inserted: ${totalInserted} | Skipped: ${totalSkipped}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
