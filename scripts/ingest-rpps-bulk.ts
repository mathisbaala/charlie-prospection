#!/usr/bin/env node
/**
 * ingest-rpps-bulk.ts — Alimentation prospection_persons depuis le RPPS open data.
 *
 * Source : https://www.data.gouv.fr/fr/datasets/repertoire-partage-des-professionnels-intervenant-dans-le-systeme-de-sante/
 * Fichier streamed ligne par ligne (~200 MB), ~1M lignes → ~200k libéraux.
 *
 * Usage :
 *   npx tsx scripts/ingest-rpps-bulk.ts
 *   npx tsx scripts/ingest-rpps-bulk.ts --dept 75          # filtre département
 *   npx tsx scripts/ingest-rpps-bulk.ts --dry-run          # log sans poster
 *
 * Env :
 *   INGEST_BASE_URL  URL de l'app Next.js (défaut : http://localhost:3000)
 *   ADMIN_API_KEY    Clé d'admin (x-admin-key header)
 */

import { getEnv, postBatch, sleep } from './lib/ingest-client'
import type { PersonIngestInput, PersonType } from '../lib/persons/types'

const RPPS_DATASET_ID = '69025e6c73d1f9b79ca3c365'
const DATAGOUV_API = 'https://www.data.gouv.fr/api/1'
const BATCH_SIZE = 100
const RATE_LIMIT_MS = 200

function deriveDeptFromCP(cp: string): string {
  const s = cp.trim()
  if (!s) return ''
  if (s.startsWith('97') && s.length >= 3) return s.slice(0, 3) // DOM : 971-976
  return s.slice(0, 2) // Métropole : "75", "01", "2A"/"2B" non couverts mais rares
}

const PROFESSIONS_CIBLES: { match: string; type: PersonType }[] = [
  { match: 'Médecin', type: 'médecin' },
  { match: 'Chirurgien-Dentiste', type: 'dentiste' },
  { match: 'Pharmacien', type: 'pharmacien' },
  { match: 'Masseur-Kinésithérapeute', type: 'kiné' },
  { match: 'Sage-Femme', type: 'autre_libéral' },
  { match: 'Infirmier', type: 'autre_libéral' },
  { match: 'Orthophoniste', type: 'autre_libéral' },
  { match: 'Pédicure-Podologue', type: 'autre_libéral' },
  { match: 'Ergothérapeute', type: 'autre_libéral' },
  { match: 'Opticien-Lunetier', type: 'autre_libéral' },
]

function personTypeFromProfession(libelle: string): PersonType {
  for (const { match, type } of PROFESSIONS_CIBLES) {
    if (libelle.includes(match)) return type
  }
  return 'autre_libéral'
}

async function getLatestRppsUrl(): Promise<string> {
  const res = await fetch(`${DATAGOUV_API}/datasets/${RPPS_DATASET_ID}/`)
  if (!res.ok) throw new Error(`data.gouv.fr API error: ${res.status}`)
  const dataset = await res.json()
  const resources: Array<{ url: string; format?: string; filesize?: number }> =
    dataset.resources ?? []
  console.log(`  ${resources.length} ressources dans le dataset RPPS`)

  // Priorité au fichier "personne-activite" (Extraction complète), puis fallback TXT
  const candidates = resources
    .filter(
      (r) =>
        r.url?.includes('personne-activite') ||
        r.url?.endsWith('.txt') ||
        r.format?.toLowerCase() === 'txt',
    )
    .sort((a, b) => (b.filesize ?? 0) - (a.filesize ?? 0))

  if (!candidates.length) throw new Error('Aucun fichier TXT trouvé dans le dataset RPPS')
  const chosen = candidates[0]
  console.log(`  Taille: ${((chosen.filesize ?? 0) / 1e6).toFixed(0)} MB`)
  return chosen.url
}

function detectDelimiter(headerLine: string): '|' | ';' {
  const pipes = (headerLine.match(/\|/g) ?? []).length
  const semis = (headerLine.match(/;/g) ?? []).length
  return pipes >= semis ? '|' : ';'
}

function parseLine(
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

  // Filtre mode libéral — colonne réelle: "Code mode exercice" (sans apostrophe)
  const mode = get('Code mode exercice', "Code mode d'exercice")
  if (mode !== 'L') return null

  // Filtre profession cible
  const profession = get('Libellé profession', 'Libellé Profession')
  if (!PROFESSIONS_CIBLES.some((p) => profession.includes(p.match))) return null

  const nom = get("Nom d'exercice", 'Nom exercice')
  const prenom = get("Prénom d'exercice", 'Prenom exercice')
  if (!nom || !prenom) return null

  const rpps = get('Identifiant PP', 'N° RPPS')
  const siret = get('Numéro SIRET site', 'N° SIRET site', 'N° SIRET')
  const ville = get('Libellé commune (coord. structure)', 'Libellé commune (structure)')
  const codePostal = get('Code postal (coord. structure)', 'Code postal (structure)')
  const adresse = get('Libellé Voie (coord. structure)', 'Libellé voie (coord. structure)')

  // Préférer colonne dept si non vide, sinon dériver du code postal
  const deptCol = get('Code Département (structure)', 'Code département (structure)')
    .replace(/^0+/, '') // strip leading zero (ex: "075" → "75")
  const dept = deptCol || deriveDeptFromCP(codePostal)

  if (deptFilter && dept !== deptFilter) return null
  // Spécialité médicale réelle: "Libellé savoir-faire" (ex: "Cardiologie", "Chirurgie orthopédique")
  const specialite = get('Libellé savoir-faire', 'Libellé type savoir-faire')
  const professionLibelle =
    specialite && specialite.length > 4 ? `${profession} — ${specialite}` : profession

  return {
    prenom,
    nom,
    source: 'rpps_csv',
    person_type: personTypeFromProfession(profession),
    profession_libelle: professionLibelle,
    rpps_number: rpps || undefined,
    siret: siret || undefined,
    departement: dept || undefined,
    ville: ville || undefined,
    adresse: adresse || undefined,
    code_postal: codePostal || undefined,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const deptFilter = args.includes('--dept')
    ? args[args.indexOf('--dept') + 1]
    : undefined

  const env = dryRun ? { baseUrl: '', apiKey: 'dry-run' } : getEnv()

  console.log('=== Ingest RPPS bulk ===')
  if (deptFilter) console.log(`  Filtre département : ${deptFilter}`)
  if (dryRun) console.log('  Mode dry-run : pas de POST')

  console.log('Récupération URL dataset RPPS...')
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
        const clean = line.replace(/^﻿/, '') // strip BOM
        delimiter = detectDelimiter(clean)
        headers = clean.split(delimiter).map((h) => h.trim())
        console.log(`  Délimiteur : "${delimiter}" | ${headers.length} colonnes`)
        console.log(`  Colonnes (5 premières) : ${headers.slice(0, 5).join(' | ')}`)
        continue
      }

      const person = parseLine(line, headers, delimiter, deptFilter)
      if (!person) { totalSkipped++; continue }

      if (dryRun) {
        if (totalUpserted < 5) console.log('  DRY:', JSON.stringify(person))
        totalUpserted++
        continue
      }

      batch.push(person)
      if (batch.length >= BATCH_SIZE) {
        // Dédupliquer par rpps_number dans la batch (un praticien peut avoir plusieurs activités dans le fichier)
        const seen = new Set<string>()
        const deduped = batch.filter((p) => {
          const key = p.rpps_number ?? `${p.prenom}|${p.nom}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        const r = await postBatch(deduped, env.baseUrl, env.apiKey)
        totalUpserted += r.upserted
        totalErrors += r.errors
        batch = []
        await sleep(RATE_LIMIT_MS)
        const elapsed = ((Date.now() - startAt) / 1000).toFixed(0)
        process.stdout.write(
          `\r  Lignes: ${lineCount.toLocaleString()} | Upserted: ${totalUpserted} | Errors: ${totalErrors} | Ignorées: ${totalSkipped.toLocaleString()} | ${elapsed}s  `,
        )
      }
    }
  }

  // Dernière ligne partielle
  if (buffer.trim() && headers) {
    const person = parseLine(buffer.trim(), headers, delimiter, deptFilter)
    if (person) batch.push(person)
  }
  if (!dryRun && batch.length) {
    const seen = new Set<string>()
    const deduped = batch.filter((p) => {
      const key = p.rpps_number ?? `${p.prenom}|${p.nom}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    const r = await postBatch(deduped, env.baseUrl, env.apiKey)
    totalUpserted += r.upserted
    totalErrors += r.errors
  }

  const elapsed = ((Date.now() - startAt) / 1000).toFixed(0)
  console.log('\n\n=== Terminé ===')
  console.log(`  Lignes traitées : ${lineCount.toLocaleString()}`)
  console.log(`  Upserted : ${totalUpserted} | Errors : ${totalErrors} | Ignorées : ${totalSkipped.toLocaleString()}`)
  console.log(`  Durée : ${elapsed}s`)
}

main().catch((e) => { console.error(e); process.exit(1) })
