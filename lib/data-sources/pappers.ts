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

export interface PappersDirigeant {
  nom: string
  prenom?: string
  qualite?: string
  date_de_naissance?: string
  annee_de_naissance?: string
}

export interface PappersEntreprise {
  siren: string
  nom_entreprise: string
  code_naf?: string
  libelle_code_naf?: string
  date_creation?: string
  tranche_effectif?: string
  effectif_max?: number
  capital?: number
  siege?: {
    adresse_ligne_1?: string
    code_postal?: string
    ville?: string
    departement?: string
    latitude?: number
    longitude?: number
  }
  dirigeants?: PappersDirigeant[]
}

export interface PappersPersonne {
  nom: string
  prenom?: string
  date_de_naissance?: string
  annee_de_naissance?: string
  qualite?: string
  // entreprises where this person is a dirigeant
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
  const url = new URL(`${BASE}/recherche`)
  url.searchParams.set('api_token', token())
  if (params.q) url.searchParams.set('q', params.q)
  if (params.code_naf) url.searchParams.set('code_naf', normalizeNaf(params.code_naf))
  if (params.departement) url.searchParams.set('departement', params.departement)
  url.searchParams.set('par_page', String(params.par_page ?? 20))
  url.searchParams.set('page', String(params.page ?? 1))

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 3600 } })
    if (!res.ok) return { resultats: [], total: 0 }
    const data = await res.json()
    return {
      resultats: data.resultats ?? [],
      total: data.total ?? 0,
    }
  } catch {
    return { resultats: [], total: 0 }
  }
}

export async function searchPersonnes(params: {
  q: string
  par_page?: number
  page?: number
}): Promise<{ resultats: PappersPersonne[]; total: number }> {
  const url = new URL(`${BASE}/recherche-dirigeants`)
  url.searchParams.set('api_token', token())
  url.searchParams.set('q', params.q)
  // filter for physical persons only
  url.searchParams.set('type_dirigeant', 'pp')
  url.searchParams.set('par_page', String(params.par_page ?? 20))
  url.searchParams.set('page', String(params.page ?? 1))

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 3600 } })
    if (!res.ok) return { resultats: [], total: 0 }
    const data = await res.json()
    return {
      resultats: data.resultats ?? [],
      total: data.total ?? 0,
    }
  } catch {
    return { resultats: [], total: 0 }
  }
}
