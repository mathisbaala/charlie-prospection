import { searchEntreprises, type AEResult } from '@/lib/data-sources/annuaire-entreprises'
import { mapRolesToNaf, mapLocationsToDepartements } from './naf-mapper'
import type { ParsedIcpCriteria } from '@/lib/types'

export interface RawProspect {
  uid: string
  entreprise_nom: string
  siren: string
  code_naf: string
  libelle_naf: string
  date_creation: string
  tranche_effectifs: string
  adresse: string
  code_postal: string
  ville: string
  departement: string
  dirigeant_nom: string
  dirigeant_prenom: string
  dirigeant_qualite: string
  dirigeant_annee_naissance?: number
  linkedin_search_url: string
  score_initial: number
}

function buildLinkedInSearchUrl(prenom: string, nom: string, entreprise: string): string {
  const q = encodeURIComponent(`${prenom} ${nom} ${entreprise}`)
  return `https://www.linkedin.com/search/results/people/?keywords=${q}`
}

function estimateInitialScore(
  ae: AEResult,
  dirigeant: NonNullable<AEResult['dirigeants']>[0]
): number {
  let score = 20

  if (ae.date_creation) {
    const years = new Date().getFullYear() - new Date(ae.date_creation).getFullYear()
    if (years >= 10) score += 20
    else if (years >= 5) score += 10
    else score += 5
  }

  const eff = ae.tranche_effectif_salarie ?? ''
  if (['20', '21', '22', '31', '32', '41', '42', '51', '52', '53'].includes(eff)) score += 20
  else if (['11', '12'].includes(eff)) score += 10

  const naf = ae.activite_principale ?? ''
  if (naf.startsWith('86') || naf.startsWith('69')) score += 15

  if (dirigeant?.annee_de_naissance) {
    const age = new Date().getFullYear() - parseInt(dirigeant.annee_de_naissance)
    if (age >= 45 && age <= 65) score += 15
    else if (age >= 35 && age < 45) score += 10
  }

  return Math.min(score, 70)
}

export async function searchProspects(
  criteria: ParsedIcpCriteria,
  options: { limit?: number } = {}
): Promise<RawProspect[]> {
  const limit = options.limit ?? 30
  const { codes: nafCodes, keywords } = mapRolesToNaf(criteria.roles)
  const departements = mapLocationsToDepartements(criteria.locations)

  const results: RawProspect[] = []
  const seen = new Set<string>()

  const nafList = nafCodes.length > 0 ? nafCodes : [undefined]
  const deptList = departements.length > 0 ? departements : [undefined]

  for (const naf of nafList.slice(0, 3)) {
    for (const dept of deptList.slice(0, 5)) {
      if (results.length >= limit) break

      const q = nafCodes.length === 0 ? keywords.join(' ') : undefined

      try {
        const { results: aeResults } = await searchEntreprises({
          q,
          activite_principale: naf,
          departement: dept,
          per_page: 25,
        })

        for (const ae of aeResults) {
          if (results.length >= limit) break
          if (seen.has(ae.siren)) continue
          if (!ae.dirigeants?.length) continue

          seen.add(ae.siren)
          const dirigeant = ae.dirigeants[0]
          const prenom = dirigeant.prenoms?.split(' ')[0] ?? ''
          const nom = dirigeant.nom ?? ''

          results.push({
            uid: ae.siren,
            entreprise_nom: ae.nom_complet,
            siren: ae.siren,
            code_naf: ae.activite_principale,
            libelle_naf: ae.libelle_activite_principale ?? '',
            date_creation: ae.date_creation ?? '',
            tranche_effectifs: ae.tranche_effectif_salarie ?? '',
            adresse: ae.siege?.adresse ?? '',
            code_postal: ae.siege?.code_postal ?? '',
            ville: ae.siege?.commune ?? '',
            departement: ae.siege?.departement ?? dept ?? '',
            dirigeant_nom: nom,
            dirigeant_prenom: prenom,
            dirigeant_qualite: dirigeant.qualite ?? 'dirigeant',
            dirigeant_annee_naissance: dirigeant.annee_de_naissance
              ? parseInt(dirigeant.annee_de_naissance)
              : undefined,
            linkedin_search_url: buildLinkedInSearchUrl(prenom, nom, ae.nom_complet),
            score_initial: estimateInitialScore(ae, dirigeant),
          })
        }
      } catch {
        continue
      }
    }
    if (results.length >= limit) break
  }

  return results
}
