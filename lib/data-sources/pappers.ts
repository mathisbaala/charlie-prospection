import { timedFetch } from '@/lib/observability/logger'
import { tryConsumeQuota } from '@/lib/observability/api-quota'

const BASE = 'https://api.pappers.fr/v2'

function token() {
  const key = process.env.PAPPERS_API_KEY
  if (!key) throw new Error('PAPPERS_API_KEY manquant')
  return key
}

// NAF format: strip dot for Pappers (86.21Z → 8621Z)
function normalizeNaf(code: string): string {
  return code.replace('.', '')
}

// Représentant physique d'une entreprise (champ "representants" dans /entreprise)
export interface PappersRepresentant {
  nom: string
  prenom?: string
  prenom_usuel?: string
  qualite?: string
  personne_morale: boolean
  date_de_naissance?: string       // "YYYY-MM-DD"
  date_de_naissance_rgpd?: string  // "YYYY-MM" (privacy-safe)
  age?: number
  sexe?: string
  departement?: string
}

export interface PappersEntreprise {
  siren: string
  nom_entreprise: string
  personne_morale?: boolean
  nom?: string    // populated for individual entrepreneurs
  prenom?: string // populated for individual entrepreneurs
  code_naf?: string
  libelle_code_naf?: string
  date_creation?: string
  tranche_effectif?: string
  effectif_max?: number
  capital?: number
  nb_dirigeants_total?: number
  siege?: {
    adresse_ligne_1?: string
    code_postal?: string
    ville?: string
    departement?: string
    latitude?: number
    longitude?: number
  }
}

export interface PappersPersonne {
  nom?: string
  prenom?: string
  qualite?: string
  entreprises?: Array<{
    siren: string
    nom_entreprise: string
    code_naf?: string
    libelle_code_naf?: string
    date_creation?: string
    siege?: PappersEntreprise['siege']
  }>
}

export async function searchEntreprises(params: {
  q?: string
  code_naf?: string
  departement?: string
  par_page?: number
  page?: number
}): Promise<{ resultats: PappersEntreprise[]; total: number }> {
  // Daily-cap guard. If the org has burned through the budget, return an empty
  // result instead of hitting Pappers — callers degrade gracefully.
  if (!(await tryConsumeQuota('pappers'))) return { resultats: [], total: 0 }

  const url = new URL(`${BASE}/recherche`)
  url.searchParams.set('api_token', token())
  if (params.q) url.searchParams.set('q', params.q)
  if (params.code_naf) url.searchParams.set('code_naf', normalizeNaf(params.code_naf))
  if (params.departement) url.searchParams.set('departement', params.departement)
  url.searchParams.set('par_page', String(params.par_page ?? 20))
  url.searchParams.set('page', String(params.page ?? 1))

  try {
    const res = await timedFetch('pappers', 'searchEntreprises', url.toString(), { next: { revalidate: 3600 } })
    if (!res.ok) return { resultats: [], total: 0 }
    const data = await res.json()
    return { resultats: data.resultats ?? [], total: data.total ?? 0 }
  } catch {
    return { resultats: [], total: 0 }
  }
}

// Fetch full company details to get representants (people)
// /recherche doesn't include them inline — only /entreprise does
export async function getEntrepriseRepresentants(siren: string): Promise<PappersRepresentant[]> {
  if (!(await tryConsumeQuota('pappers'))) return []
  try {
    const url = `${BASE}/entreprise?api_token=${token()}&siren=${siren}`
    const res = await timedFetch('pappers', 'getEntrepriseRepresentants', url, { next: { revalidate: 86400 } })
    if (!res.ok) return []
    const data = await res.json()
    return (data.representants ?? []).filter((r: PappersRepresentant) => !r.personne_morale)
  } catch {
    return []
  }
}

// Financials from /entreprise — chiffre d'affaires, résultat, marges, BFR, etc.
export interface PappersFinances {
  annee: number
  chiffre_affaires?: number
  resultat?: number
  marge_brute?: number
  excedent_brut_exploitation?: number
  resultat_exploitation?: number
  taux_croissance_chiffre_affaires?: number
  taux_marge_EBITDA?: number
  taux_marge_operationnelle?: number
  fonds_propres?: number
  rentabilite_fonds_propres?: number
  dettes_financieres?: number
  capacite_autofinancement?: number
  effectif?: number | null
}

export interface PappersBeneficiaireEffectif {
  nom?: string
  prenom?: string
  date_de_naissance?: string
  pourcentage_parts?: number
  pourcentage_votes?: number
  nationalite?: string
}

export interface PappersEnrichment {
  finances: PappersFinances[]
  beneficiaires_effectifs: PappersBeneficiaireEffectif[]
  procedure_collective_en_cours: boolean
  capital?: number
  forme_juridique?: string
  numero_tva_intracommunautaire?: string
  date_immatriculation_rcs?: string
  greffe?: string
  effectif_max?: number
  nb_etablissements?: number
}

// Fetch the full enrichment payload for a SIREN — finances, BEs, procédures collectives
export async function getPappersEnrichment(siren: string): Promise<PappersEnrichment | null> {
  if (!(await tryConsumeQuota('pappers'))) return null
  try {
    const url = `${BASE}/entreprise?api_token=${token()}&siren=${siren}`
    const res = await timedFetch('pappers', 'getPappersEnrichment', url, { next: { revalidate: 86400 } })
    if (!res.ok) return null
    const data = await res.json()
    return {
      finances: data.finances ?? [],
      beneficiaires_effectifs: data.beneficiaires_effectifs ?? [],
      procedure_collective_en_cours: data.procedure_collective_en_cours ?? false,
      capital: data.capital,
      forme_juridique: data.forme_juridique,
      numero_tva_intracommunautaire: data.numero_tva_intracommunautaire,
      date_immatriculation_rcs: data.date_immatriculation_rcs,
      greffe: data.greffe,
      effectif_max: data.effectif_max,
      nb_etablissements: data.etablissements?.length,
    }
  } catch {
    return null
  }
}

export async function searchPersonnes(params: {
  q: string
  par_page?: number
  page?: number
}): Promise<{ resultats: PappersPersonne[]; total: number }> {
  if (!(await tryConsumeQuota('pappers'))) return { resultats: [], total: 0 }

  const url = new URL(`${BASE}/recherche-dirigeants`)
  url.searchParams.set('api_token', token())
  url.searchParams.set('q', params.q)
  url.searchParams.set('type_dirigeant', 'pp')
  url.searchParams.set('par_page', String(params.par_page ?? 20))
  url.searchParams.set('page', String(params.page ?? 1))

  try {
    const res = await timedFetch('pappers', 'searchPersonnes', url.toString(), { next: { revalidate: 3600 } })
    if (!res.ok) return { resultats: [], total: 0 }
    const data = await res.json()
    return { resultats: data.resultats ?? [], total: data.total ?? 0 }
  } catch {
    return { resultats: [], total: 0 }
  }
}

/** Normalise a name segment for comparison (lowercase, no diacritics, trim). */
function normName(s: string | undefined | null): string {
  if (!s) return ''
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

/**
 * Récupère toutes les entreprises où une personne physique apparaît
 * comme dirigeante. Match prénom + nom (insensible aux accents/casse).
 *
 * Pourquoi : pour l'analyse de portefeuille patrimonial multi-entités —
 * un CGP veut savoir qu'un dirigeant gère aussi 2 SCI et 1 holding.
 *
 * Retourne la première personne qui matche prénom + nom (Pappers retourne
 * souvent plusieurs homonymes). Si match incertain → retourne null pour
 * éviter de polluer le portefeuille avec un mauvais homonyme.
 *
 * Coût quota: 1 appel Pappers (déjà couvert par tryConsumeQuota dans
 * searchPersonnes).
 */
export async function getPersonneEntreprises(
  prenom: string,
  nom: string,
): Promise<PappersPersonne | null> {
  const cleanPrenom = (prenom ?? '').trim()
  const cleanNom = (nom ?? '').trim()
  if (!cleanPrenom || !cleanNom) return null

  const { resultats } = await searchPersonnes({
    q: `${cleanPrenom} ${cleanNom}`,
    par_page: 5,
  })
  if (resultats.length === 0) return null

  const wantPrenom = normName(cleanPrenom)
  const wantNom = normName(cleanNom)

  // Best match: exact nom + prenom matches
  for (const r of resultats) {
    if (normName(r.nom) === wantNom && normName(r.prenom) === wantPrenom) {
      return r
    }
  }
  // Fallback: nom exact + prenom starts with (handle "Jean-François" vs "Jean")
  for (const r of resultats) {
    if (
      normName(r.nom) === wantNom &&
      normName(r.prenom).startsWith(wantPrenom)
    ) {
      return r
    }
  }
  // If we can't confidently identify the person, refuse (avoid wrong homonym).
  return null
}
