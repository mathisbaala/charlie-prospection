#!/usr/bin/env node
/**
 * ingest-medecins-selas.ts — Médecins spécialistes libéraux en société (SELAS/SELARL).
 *
 * Source : API Recherche Entreprises (data.gouv.fr / INSEE)
 *   NAF 86.21Z — Médecine générale en consultation (généralistes avec cabinet constitué)
 *   NAF 86.22Z — Médecine spécialisée (spécialistes libéraux en SELAS/SELARL/SCP)
 *
 * Pourquoi ce script en plus du RPPS ?
 *   L'ingest RPPS (ingest-rpps-bulk.ts) couvre ~200k libéraux de santé mais ne
 *   remonte PAS le SIREN. Sans SIREN, Pappers ne peut pas enrichir les finances,
 *   les bénéficiaires effectifs ni le portefeuille de sociétés.
 *   Ce script cible les médecins qui ont constitué une société (SELAS, SELARL,
 *   SCP) — ceux-là ont un SIREN et sont donc enrichissables à pleine profondeur.
 *   Intérêt : un chirurgien associé d'une SELAS avec CA > 500k€ est un prospect
 *   CGP de premier rang. Sans SIREN, on ne voit pas ces finances.
 *
 * Coverage :
 *   - NAF 86.22Z : ~25 000 sociétés (chirurgiens, cardiologues, radios, ORL,
 *     gynécologues, ophtalmologistes, anesthésistes, psychiatres, etc.)
 *   - NAF 86.21Z : ~15 000 sociétés (généralistes avec cabinet ou SCP)
 *   - Overlap RPPS : fort — mais RPPS n'a pas de SIREN, ce script si.
 *
 * Usage :
 *   npx tsx scripts/ingest-medecins-selas.ts
 *   npx tsx scripts/ingest-medecins-selas.ts --naf 86.22Z
 *   npx tsx scripts/ingest-medecins-selas.ts --dept 75
 *   npx tsx scripts/ingest-medecins-selas.ts --dry-run
 *
 * Env :
 *   INGEST_BASE_URL  URL de l'app Next.js (défaut : http://localhost:3000)
 *   ADMIN_API_KEY    Clé d'admin
 */

import { getEnv, postBatch, sleep, DEPTS_FRANCE } from './lib/ingest-client'
import type { PersonIngestInput, PersonType } from '../lib/persons/types'

const AE_BASE = 'https://recherche-entreprises.api.gouv.fr'
const BATCH_SIZE = 30
const RATE_LIMIT_MS = 1000
const PER_PAGE = 25

interface NafConfig {
  naf: string
  sourceId: string
  professionLibelle: string
  personType: PersonType
}

const NAF_CONFIGS: NafConfig[] = [
  {
    naf: '86.22A',
    sourceId: 'ae_medecins_radiodiag_selas',
    professionLibelle: 'Radiologue / Radiothérapeute libéral',
    personType: 'médecin',
  },
  {
    naf: '86.22B',
    sourceId: 'ae_chirurgiens_selas',
    professionLibelle: 'Chirurgien libéral',
    personType: 'médecin',
  },
  {
    naf: '86.22C',
    sourceId: 'ae_medecins_specialistes_selas',
    professionLibelle: 'Médecin spécialiste libéral',
    personType: 'médecin',
  },
  {
    naf: '86.21Z',
    sourceId: 'ae_medecins_generalistes_selas',
    professionLibelle: 'Médecin généraliste libéral',
    personType: 'médecin',
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

/**
 * Détecte la spécialité la plus probable à partir du nom de la société.
 * Purement heuristique — informatif, pas critique pour le scoring.
 */
function extractSpecialite(nomComplet: string): string | null {
  const nom = nomComplet.toLowerCase()
  const MAP: [string[], string][] = [
    [['chirurgie', 'chirurg'], 'Chirurgien'],
    [['cardio'], 'Cardiologue'],
    [['radio', 'imagerie', 'scanner', 'irm'], 'Radiologue / Imagerie'],
    [['ophtalmol', 'ophtalmo', 'ophthal'], 'Ophtalmologiste'],
    [['gynécol', 'gynecol', 'gynéco'], 'Gynécologue'],
    [['anesthés', 'anesthes'], 'Anesthésiste'],
    [['psychiatr', 'psy'], 'Psychiatre'],
    [['dermato'], 'Dermatologue'],
    [['ortho', 'orthopéd', 'orthoped'], 'Chirurgien orthopédiste'],
    [['orl', 'oto-rhino'], 'ORL'],
    [['gastro', 'endoscop'], 'Gastro-entérologue'],
    [['pneumo'], 'Pneumologue'],
    [['neuro', 'neuroch'], 'Neurologue / Neurochirurgien'],
    [['oncol', 'cancéro'], 'Oncologue'],
    [['rhumato'], 'Rhumatologue'],
    [['péd', 'pediatr', 'pédiatr'], 'Pédiatre'],
    [['urolog', 'uro'], 'Urologue'],
    [['stomato', 'maxillo'], 'Stomatologie / Chirurgie maxillo'],
    [['plastique', 'esthét', 'esthe'], 'Chirurgie plastique / esthétique'],
  ]
  for (const [keywords, label] of MAP) {
    if (keywords.some(kw => nom.includes(kw))) return label
  }
  return null
}

async function fetchMedecinPage(
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
  const specialite = extractSpecialite(company.nom_complet)
  const professionLibelle = specialite
    ? `${config.professionLibelle} — ${specialite}`
    : config.professionLibelle

  return {
    prenom,
    nom,
    source: config.sourceId,
    person_type: config.personType,
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
      const { results, total } = await fetchMedecinPage(config.naf, dept, page)
      await sleep(RATE_LIMIT_MS)

      const lastPage = Math.ceil(total / PER_PAGE) || 1

      for (const company of results) {
        companiesScanned++
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

  console.log('=== Ingest Médecins Libéraux en Société (SELAS/SELARL) ===')
  console.log(`  NAF ciblés : ${toProcess.map(c => c.naf).join(', ')}`)
  console.log(`  Départements : ${depts.length === 1 ? depts[0] : depts.length + ' depts'}`)
  if (dryRun) console.log('  Mode dry-run')

  const startAt = Date.now()
  let grandTotal = 0

  for (const config of toProcess) {
    const { upserted } = await ingestNaf(config, depts, env, dryRun)
    grandTotal += upserted
  }

  const elapsed = ((Date.now() - startAt) / 1000).toFixed(0)
  console.log(`\n\n=== Terminé — ${grandTotal} médecins libéraux | ${elapsed}s ===`)
}

main().catch(e => { console.error(e); process.exit(1) })
