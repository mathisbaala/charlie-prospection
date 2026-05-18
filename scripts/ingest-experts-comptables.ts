#!/usr/bin/env node
/**
 * ingest-experts-comptables.ts — Alimentation prospection_persons pour les EC.
 *
 * Source : API Recherche Entreprises (data.gouv.fr / INSEE)
 *   https://recherche-entreprises.api.gouv.fr/search
 *   NAF 69.20Z (Activités comptables) = cabinets d'expertise comptable + CAC
 *   include_dirigeants=true → prénom + nom de l'expert-comptable dirigeant
 *
 * Usage :
 *   npx tsx scripts/ingest-experts-comptables.ts
 *   npx tsx scripts/ingest-experts-comptables.ts --dept 75
 *   npx tsx scripts/ingest-experts-comptables.ts --dry-run
 *
 * Env :
 *   INGEST_BASE_URL  URL de l'app Next.js (défaut : http://localhost:3000)
 *   ADMIN_API_KEY    Clé d'admin
 */

import { postBatch, sleep, DEPTS_FRANCE } from './lib/ingest-client'
import type { PersonIngestInput, PersonType } from '../lib/persons/types'

const AE_BASE = 'https://recherche-entreprises.api.gouv.fr'
const BATCH_SIZE = 500
const RATE_LIMIT_MS = 1000
const PER_PAGE = 25

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
  nom_raison_sociale?: string
  activite_principale: string
  libelle_activite_principale?: string
  siege: AESiege
  dirigeants?: AEDirigeant[]
}

/** Mots-clés qui distinguent CAC vs EC quand les deux sont en 6920Z */
const CAC_KEYWORDS = ['commissaire aux comptes', 'commissariat aux comptes', ' cac ', 'commissaires']

function personTypeFromCompany(nom: string): PersonType {
  const lower = nom.toLowerCase()
  if (CAC_KEYWORDS.some((kw) => lower.includes(kw))) return 'autre_libéral' // CAC ≠ EC au sens patrimonial
  return 'expert_comptable'
}

async function fetchEcPage(
  dept: string,
  page: number,
): Promise<{ results: AEResult[]; total: number }> {
  const url = new URL(`${AE_BASE}/search`)
  url.searchParams.set('activite_principale', '69.20Z')
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

function mapDirigeant(
  d: AEDirigeant,
  company: AEResult,
): PersonIngestInput | null {
  const nom = (d.nom ?? '').trim()
  const prenom = (d.prenoms ?? '').trim()
  if (!nom || !prenom) return null

  const annee = d.annee_de_naissance
    ? parseInt(d.annee_de_naissance, 10)
    : undefined

  const personType = personTypeFromCompany(company.nom_complet)
  const professionLibelle =
    personType === 'expert_comptable' ? 'Expert-comptable' : 'Commissaire aux comptes'

  return {
    prenom,
    nom,
    source: 'annuaire_entreprises_ec',
    person_type: personType,
    profession_libelle: professionLibelle,
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

  console.log('=== Ingest Experts-Comptables (Annuaire Entreprises NAF 69.20Z) ===')
  console.log(`  Départements : ${deptFilter.length === 1 ? deptFilter[0] : `${deptFilter.length} depts`}`)
  if (dryRun) console.log('  Mode dry-run : pas de POST')

  let batch: PersonIngestInput[] = []
  let totalUpserted = 0
  let totalErrors = 0
  let totalSkipped = 0
  let companiesScanned = 0
  const startAt = Date.now()

  for (const dept of deptFilter) {
    let page = 1

    while (true) {
      const { results, total } = await fetchEcPage(dept, page)
      await sleep(RATE_LIMIT_MS)

      const lastPage = Math.ceil(total / PER_PAGE) || 1

      for (const company of results) {
        companiesScanned++

        for (const d of company.dirigeants ?? []) {
          const person = mapDirigeant(d, company)
          if (!person) { totalSkipped++; continue }

          if (dryRun) {
            if (totalUpserted < 5) console.log('  DRY:', JSON.stringify(person))
            totalUpserted++
            continue
          }

          batch.push(person)
          if (batch.length >= BATCH_SIZE) {
            const r = await postBatch(batch)
            totalUpserted += r.upserted
            totalErrors += r.errors
            batch = []
            await sleep(RATE_LIMIT_MS)
          }
        }
      }

      const elapsed = ((Date.now() - startAt) / 1000).toFixed(0)
      process.stdout.write(
        `\r  Dept ${dept} page ${page}/${lastPage} | Cabinets: ${companiesScanned} | Upserted: ${totalUpserted} | Errors: ${totalErrors} | ${elapsed}s  `,
      )

      if (results.length < PER_PAGE || page >= lastPage) break
      page++
    }
  }

  if (!dryRun && batch.length) {
    const r = await postBatch(batch)
    totalUpserted += r.upserted
    totalErrors += r.errors
  }

  const elapsed = ((Date.now() - startAt) / 1000).toFixed(0)
  console.log('\n\n=== Terminé ===')
  console.log(`  Cabinets scannés : ${companiesScanned}`)
  console.log(`  Upserted : ${totalUpserted} | Errors : ${totalErrors} | Ignorés (sans nom) : ${totalSkipped}`)
  console.log(`  Durée : ${elapsed}s`)
}

main().catch((e) => { console.error(e); process.exit(1) })
