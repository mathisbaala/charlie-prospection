// Annuaire Santé — RPPS / ADELI
// Free API for French health professionals
// Doc: https://annuaire.sante.fr/web/site-pro/ouverture-donnees
import { timedFetch } from '@/lib/observability/logger'

const BASE = 'https://annuaire.sante.fr/api/v2.0'

export interface RppsProfessionnel {
  identifiant?: string
  nomFamille?: string
  prenomUsuel?: string
  libelleCivilite?: string
  libelleProfession?: string
  libelleCategorieProfessionnelle?: string
  exerciceActivite?: Array<{
    libelleProfession?: string
    libelleSavoirFaire?: string
    libelleMode?: string
    libelleSecteurActivite?: string
    libelleSectionTableau?: string
    libelleTypeActiviteLiberale?: string
  }>
  situationExercice?: Array<{
    raisonSociale?: string
    libelleCommune?: string
    codePostal?: string
    departement?: string
    adresseLigne1?: string
    libelleSavoirFaire?: string
  }>
}

// Search RPPS by family name + first name + departement
// Matches the dirigeant if they are a registered health professional
export async function searchRpps(params: {
  nom: string
  prenom?: string
  departement?: string
  limit?: number
}): Promise<RppsProfessionnel[]> {
  if (!params.nom?.trim()) return []
  try {
    const url = new URL(`${BASE}/ps`)
    url.searchParams.set('actif', '1')
    url.searchParams.set('nomFamille', params.nom.toUpperCase())
    if (params.prenom) url.searchParams.set('prenomUsuel', params.prenom)
    if (params.departement) url.searchParams.set('departement', params.departement)
    url.searchParams.set('size', String(params.limit ?? 5))
    url.searchParams.set('page', '0')

    const res = await timedFetch('rpps', 'searchRpps', url.toString(), {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.content ?? data.results ?? []
  } catch {
    return []
  }
}

// Pick the best match — exact name match has highest priority
export function pickBestRppsMatch(
  results: RppsProfessionnel[],
  nom: string,
  prenom: string,
): RppsProfessionnel | null {
  if (!results.length) return null
  const nomUpper = nom.toUpperCase().trim()
  const prenomUpper = prenom.toUpperCase().trim()
  const exact = results.find(
    r =>
      r.nomFamille?.toUpperCase() === nomUpper &&
      r.prenomUsuel?.toUpperCase() === prenomUpper,
  )
  if (exact) return exact
  // Fallback: nom match only
  return results.find(r => r.nomFamille?.toUpperCase() === nomUpper) ?? null
}
