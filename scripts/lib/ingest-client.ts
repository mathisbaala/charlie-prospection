/**
 * Utilitaires partagés pour les scripts d'ingest de professions libérales.
 * Écrit directement dans Supabase (service_role) pour éviter les timeouts Vercel.
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
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

function canonicalPersonKey(prenom: string, nom: string, siren?: string): string {
  const norm = (s: string) =>
    s.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
  return `${norm(prenom)}|${norm(nom)}|${siren ?? '—'}`
}

function buildLinkedInSearchUrl(prenom: string, nom: string, entreprise: string): string {
  const q = encodeURIComponent(`${prenom} ${nom} ${entreprise}`)
  return `https://www.linkedin.com/search/results/people/?keywords=${q}`
}

function buildRawProspect(input: PersonIngestInput, canonicalKey: string) {
  return {
    uid: canonicalKey,
    source: 'annuaire_entreprises',
    source_type: 'personne_physique',
    entreprise_nom: input.entreprise_nom ?? '',
    siren: input.siren ?? '',
    code_naf: input.naf_code ?? '',
    libelle_naf: input.naf_libelle ?? '',
    date_creation: '',
    tranche_effectifs: '',
    adresse: input.adresse ?? '',
    code_postal: input.code_postal ?? '',
    ville: input.ville ?? '',
    departement: input.departement ?? '',
    dirigeant_nom: input.nom,
    dirigeant_prenom: input.prenom,
    dirigeant_qualite: input.profession_libelle ?? '',
    dirigeant_annee_naissance: input.annee_naissance,
    linkedin_search_url: input.linkedin_url ?? buildLinkedInSearchUrl(input.prenom, input.nom, input.entreprise_nom ?? ''),
    score_initial: 50,
  }
}

const FETCH_TIMEOUT_MS = 120_000 // 120s max par appel PostgREST (cold-start free tier)

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

let _supabase: ReturnType<typeof createClient> | null = null

function getSupabase() {
  if (_supabase) return _supabase
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans .env.local')
    process.exit(1)
  }
  _supabase = createClient(url, key, {
    auth: { persistSession: false },
    global: { fetch: fetchWithTimeout },
  })
  return _supabase
}

// Chunk size pour les upserts Supabase (5 rows = ~2-5s, safe sous le statement_timeout free tier)
const CHUNK = 5

export async function postBatch(
  persons: PersonIngestInput[],
): Promise<{ upserted: number; errors: number }> {
  if (!persons.length) return { upserted: 0, errors: 0 }

  const supabase = getSupabase()

  const allRows = persons.map((input) => {
    const canonical_key = input.rpps_number
      ? `rpps|${input.rpps_number}`
      : canonicalPersonKey(input.prenom, input.nom, input.siren)
    return {
      canonical_key,
      prenom: input.prenom,
      nom: input.nom,
      annee_naissance: input.annee_naissance ?? null,
      person_type: input.person_type ?? 'dirigeant',
      profession_libelle: input.profession_libelle ?? null,
      rpps_number: input.rpps_number ?? null,
      siren: input.siren ?? null,
      siret: input.siret ?? null,
      naf_code: input.naf_code ?? null,
      naf_libelle: input.naf_libelle ?? null,
      entreprise_nom: input.entreprise_nom ?? null,
      departement: input.departement ?? null,
      ville: input.ville ?? null,
      adresse: input.adresse ?? null,
      code_postal: input.code_postal ?? null,
      linkedin_url: input.linkedin_url ?? null,
      ingest_sources: [input.source],
      raw_data: buildRawProspect(input, canonical_key),
      updated_at: new Date().toISOString(),
    }
  })

  // Dédupliquer par canonical_key dans le batch
  const rows = Array.from(new Map(allRows.map(r => [r.canonical_key, r])).values())

  let totalUpserted = 0
  let totalErrors = 0

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase
          .from('prospection_persons')
          .upsert(chunk as any, { onConflict: 'canonical_key', ignoreDuplicates: false })
        if (error) {
          console.error(`\n[ingest] chunk erreur (attempt ${attempt}): ${error.message}`)
          if (attempt < 3) { await sleep(5_000 * attempt); continue }
          totalErrors += chunk.length
        } else {
          totalUpserted += chunk.length
        }
      } catch (e) {
        console.error(`\n[ingest] chunk exception (attempt ${attempt}):`, String(e))
        if (attempt < 3) { await sleep(5_000 * attempt); continue }
        totalErrors += chunk.length
      }
      break
    }
  }

  return { upserted: totalUpserted, errors: totalErrors }
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
