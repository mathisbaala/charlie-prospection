#!/usr/bin/env node
/**
 * ingest-professions-ae-complement.ts — Sources AE complémentaires haute valeur patrimoniale.
 *
 * Professions couvertes (toutes avec SIREN → enrichissement Pappers complet) :
 *
 * 1. NAF 47.73Z — Pharmacies d'officine
 *    Titulaires d'officine = propriétaires d'un fonds de commerce pharma (500k–3M€).
 *    Profil patrimonial fort : patrimoine pro + immobilier + cession future de l'officine.
 *    RPPS couvre les pharmaciens comme individus mais sans SIREN → ce script comble le gap.
 *
 * 2. NAF 86.23Z — Pratique dentaire en société (SELAS/SELARL/SCP)
 *    Chirurgiens-dentistes qui ont constitué une société = cabinet structuré.
 *    Revenus libéraux 150–500k€/an, souvent actionnaires de leur SEL.
 *    Overlap avec RPPS (sans SIREN) mais ici on a le SIREN de la structure.
 *
 * 3. NAF 86.90E — Rééducation fonctionnelle en société (kinésithérapeutes, orthophonistes…)
 *    Kinésithérapeutes libéraux en SEL ou SCP — revenus 80–200k€/an.
 *    Signal moins fort que médecins mais coverage utile.
 *
 * Usage :
 *   npx tsx scripts/ingest-professions-ae-complement.ts
 *   npx tsx scripts/ingest-professions-ae-complement.ts --naf 47.73Z
 *   npx tsx scripts/ingest-professions-ae-complement.ts --dept 75
 *   npx tsx scripts/ingest-professions-ae-complement.ts --dry-run
 *
 * Env :
 *   INGEST_BASE_URL  URL de l'app Next.js (défaut : http://localhost:3000)
 *   ADMIN_API_KEY    Clé d'admin
 */

import { getEnv, postBatch, sleep, DEPTS_FRANCE } from './lib/ingest-client'
import type { PersonIngestInput, PersonType } from '../lib/persons/types'

const AE_BASE = 'https://recherche-entreprises.api.gouv.fr'
const BATCH_SIZE = 100
const RATE_LIMIT_MS = 200
const PER_PAGE = 25

interface NafConfig {
  naf: string
  sourceId: string
  professionLibelle: string
  personType: PersonType
  keywords: string[] | null
}

const NAF_CONFIGS: NafConfig[] = [
  {
    naf: '47.73Z',
    sourceId: 'ae_pharmacies_officine',
    professionLibelle: 'Pharmacien titulaire d\'officine',
    personType: 'pharmacien',
    keywords: null, // 47.73Z = quasi-exclusif aux pharmacies → pas de filtre nécessaire
  },
  {
    naf: '86.23Z',
    sourceId: 'ae_dentistes_selas',
    professionLibelle: 'Chirurgien-dentiste libéral',
    personType: 'dentiste',
    keywords: null, // 86.23Z = pratique dentaire uniquement
  },
  {
    naf: '86.90E',
    sourceId: 'ae_kines_selas',
    professionLibelle: 'Kinésithérapeute / Rééducateur libéral',
    personType: 'kiné',
    keywords: null, // 86.90E = rééducation fonctionnelle
  },
]

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

async function fetchPage(
  naf: string,
  dept: string,
  page: number,
): Promise<{ results: AEResult[]; total: number }> {
  const url = new URL(`${AE_BASE}/search`)
  url.searchParams.set('activite_principale', naf)
  url.searchParams.set('departement', dept)
  url.searchParams.set('include_dirigeants', 'true')
  url.searchParams.set('per_page', String(PER_PAGE))
  url.searchParams.set('page', String(page))

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    console.error(`\n[AE] HTTP ${res.status} naf=${naf} dept=${dept} page=${page}`)
    return { results: [], total: 0 }
  }
  const data = await res.json()
  return {
    results: (data.results ?? []) as AEResult[],
    total: data.total_results ?? 0,
  }
}

function mapDirigeant(
  d: AEDirigeant,
  company: AEResult,
  config: NafConfig,
): PersonIngestInput | null {
  const nom = (d.nom ?? '').trim()
  const prenom = (d.prenoms ?? '').trim()
  if (!nom || !prenom) return null

  const annee = d.annee_de_naissance ? parseInt(d.annee_de_naissance, 10) : undefined

  return {
    prenom,
    nom,
    source: config.sourceId,
    person_type: config.personType,
    profession_libelle: config.professionLibelle,
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

function matchesKeywords(nomComplet: string, keywords: string[] | null): boolean {
  if (!keywords) return true
  const lower = nomComplet.toLowerCase()
  return keywords.some(kw => lower.includes(kw))
}

async function ingestNaf(
  config: NafConfig,
  depts: string[],
  env: { baseUrl: string; apiKey: string },
  dryRun: boolean,
): Promise<{ upserted: number; errors: number }> {
  let batch: PersonIngestInput[] = []
  let totalUpserted = 0
  let totalErrors = 0
  let companiesScanned = 0
  const startAt = Date.now()

  console.log(`\n--- NAF ${config.naf} (${config.professionLibelle}) ---`)

  for (const dept of depts) {
    let page = 1

    while (true) {
      const { results, total } = await fetchPage(config.naf, dept, page)
      await sleep(RATE_LIMIT_MS)

      const lastPage = Math.ceil(total / PER_PAGE) || 1

      for (const company of results) {
        companiesScanned++
        if (!matchesKeywords(company.nom_complet, config.keywords)) continue

        for (const d of company.dirigeants ?? []) {
          const person = mapDirigeant(d, company, config)
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
        `\r  ${config.naf} dept ${dept} ${page}/${lastPage} | Sociétés: ${companiesScanned} | Upserted: ${totalUpserted} | ${elapsed}s  `,
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

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const nafFilter = args.includes('--naf') ? args[args.indexOf('--naf') + 1] : null
  const deptArg = args.includes('--dept') ? args[args.indexOf('--dept') + 1] : undefined
  const depts = deptArg ? [deptArg] : DEPTS_FRANCE

  const env = dryRun ? { baseUrl: '', apiKey: 'dry-run' } : getEnv()

  const toProcess = nafFilter
    ? NAF_CONFIGS.filter(c => c.naf === nafFilter)
    : NAF_CONFIGS

  if (!toProcess.length) {
    console.error(`❌ NAF inconnu : ${nafFilter}. Disponibles : ${NAF_CONFIGS.map(c => c.naf).join(', ')}`)
    process.exit(1)
  }

  console.log('=== Ingest Professions AE Complémentaires ===')
  console.log(`  NAF ciblés : ${toProcess.map(c => `${c.naf} (${c.professionLibelle})`).join(', ')}`)
  console.log(`  Départements : ${depts.length === 1 ? depts[0] : depts.length + ' depts'}`)
  if (dryRun) console.log('  Mode dry-run')

  const startAt = Date.now()
  let grandTotal = 0

  for (const config of toProcess) {
    const { upserted } = await ingestNaf(config, depts, env, dryRun)
    grandTotal += upserted
    console.log(`\n  ${config.naf} terminé : ${upserted} personnes ingérées`)
  }

  const elapsed = ((Date.now() - startAt) / 1000).toFixed(0)
  console.log(`\n\n=== Terminé — ${grandTotal} personnes | ${elapsed}s ===`)
}

main().catch(e => { console.error(e); process.exit(1) })
