#!/usr/bin/env node
/**
 * ingest-biologistes-medicaux.ts — Biologistes médicaux libéraux.
 *
 * Deux sources complémentaires :
 *
 * 1. Annuaire Entreprises — NAF 86.90B (Laboratoires d'analyses médicales)
 *    Couvre les labos privés (SELAFlex, SCP, SAS, EI). Donne le SIREN
 *    du labo → enrichissement Pappers possible. Coverage ~90% des labos
 *    car le NAF 86.90B est quasi-exclusif aux analyses médicales.
 *
 * 2. RPPS open data — profession "Biologiste Médical" en mode libéral.
 *    Complète les biologistes en exercice individuel sans société dédiée.
 *    Pas de SIREN via RPPS, mais donne identité + département + spécialité.
 *
 * Intérêt patrimonial : les biologistes médicaux en labo privé sont parmi
 * les professions libérales de santé les mieux rémunérées (~300-500k€/an
 * pour un associé de labo), souvent avec participation au capital (parts
 * de SEL). Signal patrimonial fort.
 *
 * Usage :
 *   npx tsx scripts/ingest-biologistes-medicaux.ts
 *   npx tsx scripts/ingest-biologistes-medicaux.ts --dept 75
 *   npx tsx scripts/ingest-biologistes-medicaux.ts --source ae    # AE seulement
 *   npx tsx scripts/ingest-biologistes-medicaux.ts --source rpps  # RPPS seulement
 *   npx tsx scripts/ingest-biologistes-medicaux.ts --dry-run
 *
 * Env :
 *   INGEST_BASE_URL  URL de l'app Next.js (défaut : http://localhost:3000)
 *   ADMIN_API_KEY    Clé d'admin
 */

import { createReadStream } from 'fs'
import { getEnv, postBatch, sleep, DEPTS_FRANCE } from './lib/ingest-client'
import type { PersonIngestInput, PersonType } from '../lib/persons/types'

const AE_BASE = 'https://recherche-entreprises.api.gouv.fr'
const RPPS_DATASET_ID = '69025e6c73d1f9b79ca3c365'
const DATAGOUV_API = 'https://www.data.gouv.fr/api/1'
const BATCH_SIZE = 500
const RATE_LIMIT_MS = 1000
const PER_PAGE = 25

// ── AE Source ────────────────────────────────────────────────────────────────

interface AEDirigeant {
  nom: string
  prenoms?: string
  qualite?: string
  annee_de_naissance?: string
}

interface AESiege {
  adresse?: string
  code_postal?: string
  libelle_commune?: string
  departement?: string
}

interface AEResult {
  siren: string
  nom_complet: string
  activite_principale: string
  libelle_activite_principale?: string
  siege: AESiege
  dirigeants?: AEDirigeant[]
}

async function fetchLaboPage(
  dept: string,
  page: number,
): Promise<{ results: AEResult[]; total: number }> {
  const url = new URL(`${AE_BASE}/search`)
  url.searchParams.set('activite_principale', '86.90B')
  url.searchParams.set('departement', dept)
  url.searchParams.set('include_dirigeants', 'true')
  url.searchParams.set('per_page', String(PER_PAGE))
  url.searchParams.set('page', String(page))

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    console.error(`\n[AE] HTTP ${res.status} dept=${dept} page=${page}`)
    return { results: [], total: 0 }
  }
  const data = await res.json()
  return {
    results: (data.results ?? []) as AEResult[],
    total: data.total_results ?? 0,
  }
}

function mapAEDirigeant(d: AEDirigeant, company: AEResult): PersonIngestInput | null {
  const nom = (d.nom ?? '').trim()
  const prenom = (d.prenoms ?? '').trim()
  if (!nom || !prenom) return null

  const annee = d.annee_de_naissance ? parseInt(d.annee_de_naissance, 10) : undefined

  return {
    prenom,
    nom,
    source: 'ae_biologistes_medicaux',
    person_type: 'médecin' as PersonType,
    profession_libelle: 'Biologiste médical',
    annee_naissance: annee && !isNaN(annee) ? annee : undefined,
    siren: company.siren,
    entreprise_nom: company.nom_complet,
    naf_code: company.activite_principale,
    naf_libelle: company.libelle_activite_principale ?? undefined,
    departement: company.siege.departement ?? undefined,
    ville: company.siege.libelle_commune ?? undefined,
    adresse: company.siege.adresse ?? undefined,
    code_postal: company.siege.code_postal ?? undefined,
  }
}

async function ingestFromAE(
  depts: string[],
  env: { baseUrl: string; apiKey: string },
  dryRun: boolean,
): Promise<{ upserted: number; errors: number }> {
  let batch: PersonIngestInput[] = []
  let totalUpserted = 0
  let totalErrors = 0
  let companiesScanned = 0
  const startAt = Date.now()

  console.log('\n--- Source 1: Annuaire Entreprises NAF 86.90B (labos analyses) ---')

  for (const dept of depts) {
    let page = 1

    while (true) {
      const { results, total } = await fetchLaboPage(dept, page)
      await sleep(RATE_LIMIT_MS)

      const lastPage = Math.ceil(total / PER_PAGE) || 1

      for (const company of results) {
        companiesScanned++
        for (const d of company.dirigeants ?? []) {
          const person = mapAEDirigeant(d, company)
          if (!person) continue

          if (dryRun) {
            if (totalUpserted < 3) console.log('  DRY:', JSON.stringify(person))
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
      }

      const elapsed = ((Date.now() - startAt) / 1000).toFixed(0)
      process.stdout.write(
        `\r  AE dept ${dept} ${page}/${lastPage} | Labos: ${companiesScanned} | Upserted: ${totalUpserted} | ${elapsed}s  `,
      )

      if (results.length < PER_PAGE || page >= lastPage) break
      page++
    }
  }

  if (!dryRun && batch.length) {
    const r = await postBatch(batch, env.baseUrl, env.apiKey)
    totalUpserted += r.upserted
    totalErrors += r.errors
  }

  return { upserted: totalUpserted, errors: totalErrors }
}

// ── RPPS Source ───────────────────────────────────────────────────────────────

function deriveDeptFromCP(cp: string): string {
  const s = cp.trim()
  if (!s) return ''
  if (s.startsWith('97') && s.length >= 3) return s.slice(0, 3)
  return s.slice(0, 2)
}

async function getLatestRppsUrl(): Promise<string> {
  const res = await fetch(`${DATAGOUV_API}/datasets/${RPPS_DATASET_ID}/`)
  if (!res.ok) throw new Error(`data.gouv.fr API error: ${res.status}`)
  const dataset = await res.json()
  const resources: Array<{ url: string; format?: string; filesize?: number }> =
    dataset.resources ?? []
  const candidates = resources
    .filter(r => r.url?.includes('personne-activite') || r.url?.endsWith('.txt') || r.format?.toLowerCase() === 'txt')
    .sort((a, b) => (b.filesize ?? 0) - (a.filesize ?? 0))
  if (!candidates.length) throw new Error('Aucun fichier TXT RPPS trouvé')
  return candidates[0].url
}

function detectDelimiter(headerLine: string): '|' | ';' {
  const pipes = (headerLine.match(/\|/g) ?? []).length
  const semis = (headerLine.match(/;/g) ?? []).length
  return pipes >= semis ? '|' : ';'
}

function parseRppsLine(
  line: string,
  headers: string[],
  delim: string,
  deptFilter?: string,
): PersonIngestInput | null {
  const fields = line.split(delim)
  const get = (...names: string[]): string => {
    for (const name of names) {
      const idx = headers.indexOf(name)
      if (idx >= 0) return (fields[idx] ?? '').trim()
    }
    return ''
  }

  const mode = get('Code mode exercice', "Code mode d'exercice")
  if (mode !== 'L') return null // libéral seulement

  const profession = get('Libellé profession', 'Libellé Profession')
  if (!profession.includes('Biologiste')) return null

  const nom = get("Nom d'exercice", 'Nom exercice')
  const prenom = get("Prénom d'exercice", 'Prenom exercice')
  if (!nom || !prenom) return null

  const rpps = get('Identifiant PP', 'N° RPPS')
  const siret = get('Numéro SIRET site', 'N° SIRET site', 'N° SIRET')
  const ville = get('Libellé commune (coord. structure)', 'Libellé commune (structure)')
  const codePostal = get('Code postal (coord. structure)', 'Code postal (structure)')
  const adresse = get('Libellé Voie (coord. structure)', 'Libellé voie (coord. structure)')
  const deptCol = get('Code Département (structure)', 'Code département (structure)').replace(/^0+/, '')
  const dept = deptCol || deriveDeptFromCP(codePostal)

  if (deptFilter && dept !== deptFilter) return null

  const specialite = get('Libellé savoir-faire', 'Libellé type savoir-faire')
  const professionLibelle = specialite && specialite.length > 4
    ? `Biologiste médical — ${specialite}`
    : 'Biologiste médical'

  return {
    prenom,
    nom,
    source: 'rpps_biologistes',
    person_type: 'médecin' as PersonType,
    profession_libelle: professionLibelle,
    rpps_number: rpps || undefined,
    siret: siret || undefined,
    departement: dept || undefined,
    ville: ville || undefined,
    adresse: adresse || undefined,
    code_postal: codePostal || undefined,
  }
}

async function ingestFromRpps(
  deptFilter: string | undefined,
  env: { baseUrl: string; apiKey: string },
  dryRun: boolean,
): Promise<{ upserted: number; errors: number }> {
  console.log('\n--- Source 2: RPPS (Biologiste Médical mode libéral) ---')
  console.log('  Récupération URL dataset RPPS...')
  const url = await getLatestRppsUrl()
  console.log(`  URL : ...${url.slice(-60)}`)

  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Échec téléchargement RPPS : ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')

  let buffer = ''
  let headers: string[] | null = null
  let delimiter: '|' | ';' = '|'
  let batch: PersonIngestInput[] = []
  let totalUpserted = 0
  let totalErrors = 0
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
      const line = rawLine.trim().replace(/\r$/, '')
      if (!line) continue
      lineCount++

      if (!headers) {
        const clean = line.replace(/^﻿/, '')
        delimiter = detectDelimiter(clean)
        headers = clean.split(delimiter).map(h => h.trim())
        console.log(`  Délimiteur: "${delimiter}" | ${headers.length} colonnes`)
        continue
      }

      const person = parseRppsLine(line, headers, delimiter, deptFilter)
      if (!person) { totalSkipped++; continue }

      if (dryRun) {
        if (totalUpserted < 3) console.log('  DRY:', JSON.stringify(person))
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
        const elapsed = ((Date.now() - startAt) / 1000).toFixed(0)
        process.stdout.write(
          `\r  RPPS lignes: ${lineCount.toLocaleString()} | Biologistes: ${totalUpserted} | ${elapsed}s  `,
        )
      }
    }
  }

  if (!dryRun && batch.length) {
    const r = await postBatch(batch, env.baseUrl, env.apiKey)
    totalUpserted += r.upserted
    totalErrors += r.errors
  }

  return { upserted: totalUpserted, errors: totalErrors }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const sourceFilter = args.includes('--source') ? args[args.indexOf('--source') + 1] : null
  const deptArg = args.includes('--dept') ? args[args.indexOf('--dept') + 1] : undefined
  const depts = deptArg ? [deptArg] : DEPTS_FRANCE

  const env = dryRun ? { baseUrl: '', apiKey: 'dry-run' } : getEnv()

  console.log('=== Ingest Biologistes Médicaux ===')
  console.log(`  Départements : ${depts.length === 1 ? depts[0] : depts.length + ' depts'}`)
  if (sourceFilter) console.log(`  Source : ${sourceFilter}`)
  if (dryRun) console.log('  Mode dry-run')

  const startAt = Date.now()
  let grandTotal = 0

  if (!sourceFilter || sourceFilter === 'ae') {
    const { upserted } = await ingestFromAE(depts, env, dryRun)
    grandTotal += upserted
    console.log(`\n  AE terminé : ${upserted} biologistes ingérés`)
  }

  if (!sourceFilter || sourceFilter === 'rpps') {
    try {
      const { upserted } = await ingestFromRpps(deptArg, env, dryRun)
      grandTotal += upserted
      console.log(`\n  RPPS terminé : ${upserted} biologistes ingérés`)
    } catch (e) {
      console.error('\n  RPPS erreur (non bloquant):', String(e))
    }
  }

  const elapsed = ((Date.now() - startAt) / 1000).toFixed(0)
  console.log(`\n\n=== Terminé — ${grandTotal} biologistes médicaux | ${elapsed}s ===`)
}

main().catch(e => { console.error(e); process.exit(1) })
