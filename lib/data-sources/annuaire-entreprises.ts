const BASE = 'https://recherche-entreprises.api.gouv.fr'

export interface AEDirigeant {
  nom: string
  prenoms?: string
  qualite: string
  date_naissance_timestamp_utc?: string
  annee_de_naissance?: string
}

export interface AEResult {
  siren: string
  nom_complet: string
  activite_principale: string
  libelle_activite_principale?: string
  date_creation?: string
  tranche_effectif_salarie?: string
  siege: {
    adresse?: string
    code_postal?: string
    commune?: string
    departement?: string
    latitude?: number
    longitude?: number
  }
  dirigeants?: AEDirigeant[]
}

export async function searchEntreprises(params: {
  q?: string
  activite_principale?: string
  departement?: string
  page?: number
  per_page?: number
}): Promise<{ results: AEResult[]; total_results: number }> {
  const url = new URL(`${BASE}/search`)
  if (params.q) url.searchParams.set('q', params.q)
  if (params.activite_principale) url.searchParams.set('activite_principale', params.activite_principale)
  if (params.departement) url.searchParams.set('departement', params.departement)
  url.searchParams.set('page', String(params.page ?? 1))
  url.searchParams.set('per_page', String(params.per_page ?? 25))

  // include_dirigeants ensures the dirigeants array is populated in each result
  url.searchParams.set('include_dirigeants', 'true')

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } })
  if (!res.ok) throw new Error(`AE API ${res.status}: ${url}`)
  const data = await res.json()
  return {
    results: data.results ?? [],
    total_results: data.total_results ?? 0,
  }
}

export async function getEntrepriseBySiren(siren: string): Promise<AEResult | null> {
  const res = await fetch(`${BASE}/search?q=${siren}&per_page=1`, { next: { revalidate: 3600 } })
  if (!res.ok) return null
  const data = await res.json()
  return data.results?.[0] ?? null
}
