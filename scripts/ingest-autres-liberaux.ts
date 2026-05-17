#!/usr/bin/env node
/**
 * ingest-autres-liberaux.ts — Architectes, vétérinaires, géomètres-experts.
 *
 * Source : API Recherche Entreprises (data.gouv.fr / INSEE)
 *   https://recherche-entreprises.api.gouv.fr/search
 *   include_dirigeants=true → prénom + nom directement
 *
 * Professions et NAF :
 *   architectes        71.11Z   Activités d'architecture
 *   vétérinaires       75.00Z   Activités vétérinaires
 *   géomètres-experts  71.12B   Ingénierie, études techniques (filtre mot-clé)
 *
 * Usage :
 *   npx tsx scripts/ingest-autres-liberaux.ts
 *   npx tsx scripts/ingest-autres-liberaux.ts --profession architectes
 *   npx tsx scripts/ingest-autres-liberaux.ts --dept 75
 *   npx tsx scripts/ingest-autres-liberaux.ts --dry-run
 *
 * Env :
 *   INGEST_BASE_URL  URL de l'app Next.js (défaut : http://localhost:3000)
 *   ADMIN_API_KEY    Clé d'admin
 */

import { getEnv, postBatch, sleep, DEPTS_FRANCE } from './lib/ingest-client'
import type { PersonIngestInput, PersonType } from '../lib/persons/types'

const AE_BASE = 'https://recherche-entreprises.api.gouv.fr'
const BATCH_SIZE = 500
const RATE_LIMIT_MS = 1000
const PER_PAGE = 25

interface ProfessionConfig {
  label: string
  sourceId: string
  naf: string
  personType: PersonType
  professionLibelle: string
  /** Mots-clés obligatoires dans le nom de la société (null = accepte tout) */
  keywords: string[] | null
}

const PROFESSIONS: Record<string, ProfessionConfig> = {
  architectes: {
    label: 'Architectes',
    sourceId: 'ae_architectes',
    naf: '71.11Z',
    personType: 'autre_libéral',
    professionLibelle: 'Architecte',
    keywords: null, // 71.11Z est quasi-exclusivement des architectes
  },
  veterinaires: {
    label: 'Vétérinaires',
    sourceId: 'ae_veterinaires',
    naf: '75.00Z',
    personType: 'autre_libéral',
    professionLibelle: 'Vétérinaire',
    keywords: null, // 75.00Z = activités vétérinaires uniquement
  },
  geometres: {
    label: 'Géomètres-experts',
    sourceId: 'ae_geometres_experts',
    naf: '71.12B',
    personType: 'autre_libéral',
    professionLibelle: 'Géomètre-expert',
    // 71.12B est large (ingénierie) — filtrer sur "géomètre"
    keywords: ['géomètre', 'geometre', 'ogec'],
  },
}

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

function matchesKeywords(nomComplet: string, keywords: string[] | null): boolean {
  if (!keywords) return true
  const lower = nomComplet.toLowerCase()
  return keywords.some((kw) => lower.includes(kw))
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
  config: ProfessionConfig,
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

async function ingestProfession(
  config: ProfessionConfig,
  depts: string[],
  env: { baseUrl: string; apiKey: string },
  dryRun: boolean,
): Promise<{ upserted: number; errors: number }> {
  let batch: PersonIngestInput[] = []
  let totalUpserted = 0
  let totalErrors = 0
  let companiesScanned = 0
  let companiesKept = 0
  const startAt = Date.now()

  console.log(`\n--- ${config.label} (NAF ${config.naf}) ---`)

  for (const dept of depts) {
    let page = 1

    while (true) {
      const { results, total } = await fetchPage(config.naf, dept, page)
      await sleep(RATE_LIMIT_MS)

      const lastPage = Math.ceil(total / PER_PAGE) || 1

      for (const company of results) {
        companiesScanned++
        if (!matchesKeywords(company.nom_complet, config.keywords)) continue
        companiesKept++

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
        `\r  ${config.label} dept ${dept} ${page}/${lastPage} | Entreprises: ${companiesKept}/${companiesScanned} | Upserted: ${totalUpserted} | ${elapsed}s  `,
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
  const professionFilter = args.includes('--profession')
    ? args[args.indexOf('--profession') + 1]
    : null
  const deptFilter = args.includes('--dept')
    ? [args[args.indexOf('--dept') + 1]]
    : DEPTS_FRANCE

  const env = dryRun ? { baseUrl: '', apiKey: 'dry-run' } : getEnv()

  console.log('=== Ingest Autres Libéraux ===')
  console.log(`  Départements : ${deptFilter.length === 1 ? deptFilter[0] : `${deptFilter.length} depts`}`)
  if (professionFilter) console.log(`  Profession filtrée : ${professionFilter}`)
  if (dryRun) console.log('  Mode dry-run : pas de POST')

  const toProcess = professionFilter
    ? Object.entries(PROFESSIONS).filter(([key]) => key.startsWith(professionFilter))
    : Object.entries(PROFESSIONS)

  if (!toProcess.length) {
    console.error(`❌ Profession inconnue : ${professionFilter}. Disponibles : ${Object.keys(PROFESSIONS).join(', ')}`)
    process.exit(1)
  }

  let grandTotal = 0
  const startAt = Date.now()

  for (const [, config] of toProcess) {
    const { upserted } = await ingestProfession(config, deptFilter, env, dryRun)
    grandTotal += upserted
  }

  const elapsed = ((Date.now() - startAt) / 1000).toFixed(0)
  console.log(`\n\n=== Terminé — ${grandTotal} personnes | ${elapsed}s ===`)
}

main().catch((e) => { console.error(e); process.exit(1) })
