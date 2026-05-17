/**
 * Utilitaires partagés pour les scripts d'ingest de professions libérales.
 * Charge automatiquement .env.local si présent.
 */

import { readFileSync } from 'fs'
import type { PersonIngestInput } from '../../lib/persons/types'

// Chargement manuel de .env.local (pas de dépendance dotenv)
try {
  const raw = readFileSync('.env.local', 'utf-8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
    }
  }
} catch {}

export function getEnv(): { baseUrl: string; apiKey: string } {
  const baseUrl = process.env.INGEST_BASE_URL ?? 'http://localhost:3000'
  const apiKey = process.env.ADMIN_API_KEY ?? ''
  if (!apiKey) {
    console.error('❌  ADMIN_API_KEY manquant. Ajouter dans .env.local ou exporter la variable.')
    process.exit(1)
  }
  return { baseUrl, apiKey }
}

export async function postBatch(
  persons: PersonIngestInput[],
  baseUrl: string,
  apiKey: string,
): Promise<{ upserted: number; errors: number }> {
  if (!persons.length) return { upserted: 0, errors: 0 }
  const url = `${baseUrl}/api/admin/ingest/persons`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': apiKey },
      body: JSON.stringify({ persons }),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error(`\n[ingest] HTTP ${res.status}: ${text.slice(0, 300)}`)
      return { upserted: 0, errors: persons.length }
    }
    return res.json() as Promise<{ upserted: number; errors: number }>
  } catch (e) {
    console.error('\n[ingest] fetch error:', String(e))
    return { upserted: 0, errors: persons.length }
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Départements métropolitains + DOM */
export const DEPTS_FRANCE = [
  '01','02','03','04','05','06','07','08','09',
  '10','11','12','13','14','15','16','17','18','19',
  '2A','2B',
  '21','22','23','24','25','26','27','28','29',
  '30','31','32','33','34','35','36','37','38','39',
  '40','41','42','43','44','45','46','47','48','49',
  '50','51','52','53','54','55','56','57','58','59',
  '60','61','62','63','64','65','66','67','68','69',
  '70','71','72','73','74','75','76','77','78','79',
  '80','81','82','83','84','85','86','87','88','89',
  '90','91','92','93','94','95',
  '971','972','973','974','976',
]
