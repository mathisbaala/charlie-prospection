import { searchEntreprises, getEntrepriseRepresentants, searchPersonnes, type PappersEntreprise, type PappersRepresentant } from '@/lib/data-sources/pappers'
import { mapRolesToNaf, mapLocationsToDepartements } from './naf-mapper'
import type { ParsedIcpCriteria, TargetType } from '@/lib/types'

export interface RawProspect {
  uid: string
  source_type: 'personne_morale' | 'personne_physique'
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

function anneeNaissance(rep: PappersRepresentant): number | undefined {
  // "YYYY-MM-DD" or "YYYY-MM"
  const raw = rep.date_de_naissance ?? rep.date_de_naissance_rgpd
  if (!raw) return undefined
  const year = parseInt(raw.slice(0, 4))
  return isNaN(year) ? undefined : year
}

function estimateScore(ae: PappersEntreprise, rep: PappersRepresentant): number {
  let score = 20

  if (ae.date_creation) {
    const years = new Date().getFullYear() - new Date(ae.date_creation).getFullYear()
    if (years >= 10) score += 20
    else if (years >= 5) score += 10
    else score += 5
  }

  const naf = ae.code_naf ?? ''
  if (naf.startsWith('86') || naf.startsWith('69') || naf.startsWith('6910') || naf.startsWith('6920')) score += 20
  else if (naf.startsWith('71') || naf.startsWith('75')) score += 10

  if (ae.capital && ae.capital >= 100_000) score += 15
  else if (ae.capital && ae.capital >= 10_000) score += 8

  if (ae.effectif_max && ae.effectif_max >= 20) score += 15
  else if (ae.effectif_max && ae.effectif_max >= 5) score += 8

  const annee = anneeNaissance(rep)
  if (annee) {
    const age = new Date().getFullYear() - annee
    if (age >= 45 && age <= 65) score += 15
    else if (age >= 35 && age < 45) score += 10
  }

  return Math.min(score, 75)
}

function buildRawProspect(
  ae: PappersEntreprise,
  rep: PappersRepresentant,
  sourceType: 'personne_morale' | 'personne_physique'
): RawProspect {
  const prenom = rep.prenom_usuel ?? rep.prenom?.split(/[,\s]+/)[0] ?? ''
  const nom = rep.nom ?? ''
  return {
    uid: `${ae.siren}-${nom}-${prenom}`,
    source_type: sourceType,
    entreprise_nom: ae.nom_entreprise,
    siren: ae.siren,
    code_naf: ae.code_naf ?? '',
    libelle_naf: ae.libelle_code_naf ?? '',
    date_creation: ae.date_creation ?? '',
    tranche_effectifs: ae.tranche_effectif ?? '',
    adresse: ae.siege?.adresse_ligne_1 ?? '',
    code_postal: ae.siege?.code_postal ?? '',
    ville: ae.siege?.ville ?? '',
    departement: ae.siege?.departement ?? '',
    dirigeant_nom: nom,
    dirigeant_prenom: prenom,
    dirigeant_qualite: rep.qualite ?? 'dirigeant',
    dirigeant_annee_naissance: anneeNaissance(rep),
    linkedin_search_url: buildLinkedInSearchUrl(prenom, nom, ae.nom_entreprise),
    score_initial: estimateScore(ae, rep),
  }
}

async function searchByNaf(
  criteria: ParsedIcpCriteria,
  limit: number,
  seen: Set<string>,
  sourceType: 'personne_morale' | 'personne_physique'
): Promise<RawProspect[]> {
  const { codes: nafCodes, keywords } = mapRolesToNaf(criteria.roles)
  const departements = mapLocationsToDepartements(criteria.locations)
  const results: RawProspect[] = []

  const nafList = nafCodes.length > 0 ? nafCodes : [undefined]
  const deptList = departements.length > 0 ? departements : [undefined]

  for (const naf of nafList.slice(0, 3)) {
    for (const dept of deptList.slice(0, 5)) {
      if (results.length >= limit) break

      const q = nafCodes.length === 0 ? keywords.join(' ') : undefined
      const { resultats } = await searchEntreprises({ q, code_naf: naf, departement: dept, par_page: 20 })

      // Filter unseen companies with at least one director recorded
      const candidates = resultats.filter(ae =>
        !seen.has(ae.siren) && (ae.nb_dirigeants_total ?? 1) > 0
      ).slice(0, limit - results.length)

      // Fetch representants for all candidates in parallel
      const enriched = await Promise.allSettled(
        candidates.map(async ae => {
          const reps = await getEntrepriseRepresentants(ae.siren)
          return { ae, reps }
        })
      )

      for (const result of enriched) {
        if (result.status === 'rejected' || !result.value.reps.length) continue
        const { ae, reps } = result.value
        if (seen.has(ae.siren)) continue
        seen.add(ae.siren)
        results.push(buildRawProspect(ae, reps[0], sourceType))
        if (results.length >= limit) break
      }
    }
    if (results.length >= limit) break
  }

  return results
}

export async function searchProspects(
  criteria: ParsedIcpCriteria,
  options: { limit?: number } = {}
): Promise<RawProspect[]> {
  const limit = options.limit ?? 30
  const targetType: TargetType = criteria.target_type ?? 'personne_morale'
  const seen = new Set<string>()

  const sourceType = targetType === 'personne_physique' ? 'personne_physique' : 'personne_morale'

  if (targetType === 'both') {
    const half = Math.ceil(limit / 2)
    const [morales, physiques] = await Promise.all([
      searchByNaf(criteria, half, seen, 'personne_morale'),
      searchByNaf(criteria, half, seen, 'personne_physique'),
    ])
    return [...morales, ...physiques].slice(0, limit)
  }

  return searchByNaf(criteria, limit, seen, sourceType)
}
