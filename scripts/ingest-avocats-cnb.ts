#!/usr/bin/env node
/**
 * ingest-avocats-cnb.ts — Alimentation prospection_persons pour les avocats.
 *
 * Source : API Recherche Entreprises (data.gouv.fr / INSEE)
 *   https://recherche-entreprises.api.gouv.fr/search
 *   NAF 69.10Z (Activités juridiques) + filtre mot-clé "avocat" dans nom entreprise
 *   include_dirigeants=true → prénom + nom directement
 *
 * Note : L'API CNB annuaire.cnb.avocat.fr n'est pas disponible (NXDOMAIN).
 * Fallback sur AE API qui couvre les SELARLs, SCPs et EI d'avocats inscrits au barreau.
 * Coverage estimée : ~60-70% des avocats libéraux (les cabinets dont le nom contient "avocat").
 *
 * Usage :
 *   npx tsx scripts/ingest-avocats-cnb.ts
 *   npx tsx scripts/ingest-avocats-cnb.ts --dept 75
 *   npx tsx scripts/ingest-avocats-cnb.ts --dry-run
 *
 * Env :
 *   INGEST_BASE_URL  URL de l'app Next.js (défaut : http://localhost:3000)
 *   ADMIN_API_KEY    Clé d'admin
 */

import { getEnv, postBatch, sleep, DEPTS_FRANCE } from './lib/ingest-client'
import type { PersonIngestInput } from '../lib/persons/types'

const AE_BASE = 'https://recherche-entreprises.api.gouv.fr'
const BATCH_SIZE = 500
const RATE_LIMIT_MS = 1000
const PER_PAGE = 25

/** Mots-clés qui discriminent avocat dans le nom de la société */
const AVOCAT_KEYWORDS = ['avocat', 'barreau', 'associes avocats', 'selarl avocats', 'scp avocats']

function isAvocat(nom: string): boolean {
  const lower = nom.toLowerCase()
  return AVOCAT_KEYWORDS.some((kw) => lower.includes(kw))
    && !lower.includes('notaire') // exclure les offices notariales
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

async function fetchAvocatsPage(
  dept: string,
  page: number,
): Promise<{ results: AEResult[]; total: number }> {
  const url = new URL(`${AE_BASE}/search`)
  url.searchParams.set('activite_principale', '69.10Z')
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

function mapDirigeant(d: AEDirigeant, company: AEResult): PersonIngestInput | null {
  const nom = (d.nom ?? '').trim()
  const prenom = (d.prenoms ?? '').trim()
  if (!nom || !prenom) return null

  const annee = d.annee_de_naissance ? parseInt(d.annee_de_naissance, 10) : undefined

  return {
    prenom,
    nom,
    source: 'ae_avocats',
    person_type: 'avocat',
    profession_libelle: 'Avocat',
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

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const deptFilter = args.includes('--dept')
    ? [args[args.indexOf('--dept') + 1]]
    : DEPTS_FRANCE

  const env = dryRun ? { baseUrl: '', apiKey: 'dry-run' } : getEnv()

  console.log('=== Ingest Avocats (Annuaire Entreprises NAF 69.10Z + filtre "avocat") ===')
  console.log(`  Départements : ${deptFilter.length === 1 ? deptFilter[0] : `${deptFilter.length} depts`}`)
  if (dryRun) console.log('  Mode dry-run : pas de POST')

  let batch: PersonIngestInput[] = []
  let totalUpserted = 0
  let totalErrors = 0
  let companiesScanned = 0
  let companiesKept = 0
  const startAt = Date.now()

  for (const dept of deptFilter) {
    let page = 1

    while (true) {
      const { results, total } = await fetchAvocatsPage(dept, page)
      await sleep(RATE_LIMIT_MS)

      const lastPage = Math.ceil(total / PER_PAGE) || 1

      for (const company of results) {
        companiesScanned++
        if (!isAvocat(company.nom_complet)) continue
        companiesKept++

        for (const d of company.dirigeants ?? []) {
          const person = mapDirigeant(d, company)
          if (!person) continue

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
      }

      const elapsed = ((Date.now() - startAt) / 1000).toFixed(0)
      process.stdout.write(
        `\r  Dept ${dept} page ${page}/${lastPage} | Cabinets avocat: ${companiesKept}/${companiesScanned} | Upserted: ${totalUpserted} | ${elapsed}s  `,
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

  const elapsed = ((Date.now() - startAt) / 1000).toFixed(0)
  console.log('\n\n=== Terminé ===')
  console.log(`  Cabinets scannés : ${companiesScanned} | Cabinets avocat : ${companiesKept}`)
  console.log(`  Upserted : ${totalUpserted} | Errors : ${totalErrors}`)
  console.log(`  Durée : ${elapsed}s`)
}

main().catch((e) => { console.error(e); process.exit(1) })
