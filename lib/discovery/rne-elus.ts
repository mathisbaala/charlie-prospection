import { timedFetch } from '@/lib/observability/logger'
import {
  searchEntreprises,
  type AEResult,
  type AEDirigeant,
} from '@/lib/data-sources/annuaire-entreprises'
import { canonicalPersonKey, deptFromCodePostal } from '@/lib/prospect-search/engine'
import type { DiscoverySource, DiscoveryParams } from './types'
import type { RawProspect } from '@/lib/prospect-search/engine'

// Répertoire National des Élus (data.gouv.fr) — maires, présidents de
// collectivités. Segment patrimonial fort : indemnités + réseau local + souvent
// propriétaires fonciers. Dataset public, gratuit, mis à jour mensuellement.
//
// L'URL du CSV change à chaque mise à jour data.gouv.fr : on résout d'abord
// l'URL courante via l'API datasets, puis on télécharge le CSV.
// Override : RNE_CSV_URL pour bypasser la résolution.

const DEFAULT_LIMIT = 20
// ID stable du dataset RNE sur data.gouv.fr
const RNE_DATASET_ID = '5c34944606e3e7d9de6ced25'
const RNE_API_URL = `https://www.data.gouv.fr/api/1/datasets/${RNE_DATASET_ID}/`

// Fonctions éligibles — on cible les exécutifs, pas tous les conseillers
const ELIGIBLE_FONCTIONS = [
  'maire',
  'président',
  'presidente',
  'vice-président',
  'vice-presidente',
]

interface EluRow {
  dept: string
  commune: string
  nom: string
  prenom: string
  fonction: string
}

function normFonction(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .trim()
}

function parseCsv(text: string): EluRow[] {
  const lines = text.split('\n')
  if (lines.length < 2) return []

  const header = lines[0].split(';').map((h) => h.trim().replace(/"/g, '').toLowerCase())

  const col = (name: string) => header.findIndex((h) => h.includes(name))
  const iDept = col('département')
  const iCommune = col('commune')
  const iNom = col('nom de l')
  const iPrenom = col('prénom de l')
  const iFonction = col('fonction')

  if ([iDept, iCommune, iNom, iPrenom, iFonction].some((i) => i === -1)) return []

  const rows: EluRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i].split(';')
    if (raw.length <= Math.max(iDept, iNom)) continue

    const cell = (idx: number) => raw[idx]?.trim().replace(/^"|"$/g, '') ?? ''
    const dept = cell(iDept)
    const nom = cell(iNom)
    const prenom = cell(iPrenom)
    const commune = cell(iCommune)
    const fonction = cell(iFonction)

    if (!nom || !dept) continue

    const fnNorm = normFonction(fonction)
    if (!ELIGIBLE_FONCTIONS.some((f) => fnNorm.startsWith(f))) continue

    rows.push({ dept, commune, nom, prenom, fonction })
  }
  return rows
}

async function resolveCsvUrl(): Promise<string | null> {
  if (process.env.RNE_CSV_URL) return process.env.RNE_CSV_URL
  try {
    const res = await timedFetch('rne_elus', 'resolveDatasetUrl', RNE_API_URL, {
      next: { revalidate: 86400 * 7 },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { resources?: Array<{ url: string; title: string }> }
    const resources = data.resources ?? []
    const csv = resources.find(
      (r) =>
        r.title.toLowerCase().includes('conseillers municipaux') ||
        r.title.toLowerCase().includes('municipal'),
    )
    return csv?.url ?? null
  } catch {
    return null
  }
}

async function fetchCsv(): Promise<EluRow[]> {
  const url = await resolveCsvUrl()
  if (!url) return []
  try {
    const res = await timedFetch('rne_elus', 'fetchRneCsv', url, {
      next: { revalidate: 86400 * 7 }, // cache 7 days — dataset changes monthly
    })
    if (!res.ok) return []
    const text = await res.text()
    return parseCsv(text)
  } catch {
    return []
  }
}

function buildLinkedInUrl(prenom: string, nom: string, entreprise: string): string {
  const q = encodeURIComponent(`${prenom} ${nom} ${entreprise}`)
  return `https://www.linkedin.com/search/results/people/?keywords=${q}`
}

function toRawProspect(ae: AEResult, d: AEDirigeant, elu: EluRow): RawProspect {
  const prenom = (d.prenoms?.split(/[\s,]+/)[0] ?? elu.prenom).trim()
  const nom = (d.nom ?? elu.nom).trim()
  const dept = ae.siege.departement ?? deptFromCodePostal(ae.siege.code_postal)
  return {
    uid: canonicalPersonKey(prenom, nom, ae.siren),
    source: 'rne_elus',
    source_type: 'personne_morale',
    entreprise_nom: ae.nom_complet,
    siren: ae.siren,
    code_naf: ae.activite_principale ?? '',
    libelle_naf: ae.libelle_activite_principale ?? '',
    date_creation: ae.date_creation ?? '',
    tranche_effectifs: ae.tranche_effectif_salarie ?? '',
    adresse: ae.siege.adresse ?? '',
    code_postal: ae.siege.code_postal ?? '',
    ville: ae.siege.libelle_commune ?? ae.siege.commune ?? elu.commune,
    departement: dept,
    dirigeant_nom: nom,
    dirigeant_prenom: prenom,
    // Append fonction as qualite for downstream display ("Maire de Bordeaux")
    dirigeant_qualite: `${elu.fonction} - ${elu.commune}`,
    linkedin_search_url: buildLinkedInUrl(prenom, nom, ae.nom_complet),
    score_initial: 35, // élu exécutif (maire/président) — profil patrimonial fort
  }
}

function normName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
}

async function matchEluToProspect(elu: EluRow): Promise<RawProspect | null> {
  const q = `${elu.prenom} ${elu.nom}`.trim()
  try {
    const { results } = await searchEntreprises({
      q,
      departement: elu.dept,
      per_page: 5,
    })

    const nomNorm = normName(elu.nom)
    const prenomNorm = normName(elu.prenom)

    for (const ae of results) {
      for (const d of ae.dirigeants ?? []) {
        if (!d.nom) continue
        if (normName(d.nom) !== nomNorm) continue
        const dp = normName(d.prenoms?.split(/[\s,]+/)[0] ?? '')
        if (prenomNorm && dp && !dp.startsWith(prenomNorm.slice(0, 3))) continue
        return toRawProspect(ae, d, elu)
      }
    }
  } catch {
    // AE unavailable for this elu
  }
  return null
}

export const rneElusSource: DiscoverySource = {
  name: 'rne-elus',

  async discover(params: DiscoveryParams): Promise<RawProspect[]> {
    const limit = params.limit ?? DEFAULT_LIMIT

    const allElus = await fetchCsv()
    if (!allElus.length) return []

    // Filter by departement when provided — otherwise take a national sample
    const filtered = params.departement
      ? allElus.filter((e) => e.dept === params.departement)
      : allElus

    // Cap to avoid hitting AE too many times in one run
    const candidates = filtered.slice(0, limit * 4)

    const seen = new Set<string>()
    const results: RawProspect[] = []

    const settled = await Promise.allSettled(candidates.map(matchEluToProspect))

    for (const r of settled) {
      if (results.length >= limit) break
      if (r.status === 'rejected' || !r.value) continue
      if (seen.has(r.value.uid)) continue
      seen.add(r.value.uid)
      results.push(r.value)
    }

    return results
  },
}
