import { searchEntreprises, searchPersonnes, type PappersEntreprise, type PappersDirigeant } from '@/lib/data-sources/pappers'
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

function estimateInitialScore(
  entreprise: PappersEntreprise,
  dirigeant: PappersDirigeant,
  sourceType: 'personne_morale' | 'personne_physique'
): number {
  let score = 20

  if (entreprise.date_creation) {
    const years = new Date().getFullYear() - new Date(entreprise.date_creation).getFullYear()
    if (years >= 10) score += 20
    else if (years >= 5) score += 10
    else score += 5
  }

  const naf = entreprise.code_naf ?? ''
  // Professions libérales réglementées = fort potentiel patrimonial
  if (naf.startsWith('86') || naf.startsWith('6910') || naf.startsWith('6920') || naf.startsWith('6910')) score += 20
  else if (naf.startsWith('69') || naf.startsWith('71') || naf.startsWith('75')) score += 15

  // Capital social pour personnes morales
  if (sourceType === 'personne_morale' && entreprise.capital) {
    if (entreprise.capital >= 100_000) score += 15
    else if (entreprise.capital >= 10_000) score += 8
  }

  const effectifMax = entreprise.effectif_max ?? 0
  if (effectifMax >= 20) score += 15
  else if (effectifMax >= 5) score += 8

  if (dirigeant.annee_de_naissance) {
    const age = new Date().getFullYear() - parseInt(dirigeant.annee_de_naissance)
    if (age >= 45 && age <= 65) score += 15
    else if (age >= 35 && age < 45) score += 10
  }

  return Math.min(score, 75)
}

function pappersToRawProspect(
  entreprise: PappersEntreprise,
  dirigeant: PappersDirigeant,
  sourceType: 'personne_morale' | 'personne_physique'
): RawProspect {
  const prenom = dirigeant.prenom?.split(' ')[0] ?? ''
  const nom = dirigeant.nom ?? ''
  return {
    uid: `${entreprise.siren}-${nom}-${prenom}`,
    source_type: sourceType,
    entreprise_nom: entreprise.nom_entreprise,
    siren: entreprise.siren,
    code_naf: entreprise.code_naf ?? '',
    libelle_naf: entreprise.libelle_code_naf ?? '',
    date_creation: entreprise.date_creation ?? '',
    tranche_effectifs: entreprise.tranche_effectif ?? '',
    adresse: entreprise.siege?.adresse_ligne_1 ?? '',
    code_postal: entreprise.siege?.code_postal ?? '',
    ville: entreprise.siege?.ville ?? '',
    departement: entreprise.siege?.departement ?? '',
    dirigeant_nom: nom,
    dirigeant_prenom: prenom,
    dirigeant_qualite: dirigeant.qualite ?? 'dirigeant',
    dirigeant_annee_naissance: dirigeant.annee_de_naissance
      ? parseInt(dirigeant.annee_de_naissance)
      : undefined,
    linkedin_search_url: buildLinkedInSearchUrl(prenom, nom, entreprise.nom_entreprise),
    score_initial: estimateInitialScore(entreprise, dirigeant, sourceType),
  }
}

async function searchPersonnesMorales(
  criteria: ParsedIcpCriteria,
  limit: number,
  seen: Set<string>
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
      const { resultats } = await searchEntreprises({
        q,
        code_naf: naf,
        departement: dept,
        par_page: 20,
      })
      for (const ae of resultats) {
        if (results.length >= limit) break
        if (seen.has(ae.siren)) continue
        if (!ae.dirigeants?.length) continue
        seen.add(ae.siren)
        results.push(pappersToRawProspect(ae, ae.dirigeants[0], 'personne_morale'))
      }
    }
    if (results.length >= limit) break
  }

  return results
}

async function searchPersonnesPhysiques(
  criteria: ParsedIcpCriteria,
  limit: number,
  seen: Set<string>
): Promise<RawProspect[]> {
  const { codes: nafCodes, keywords } = mapRolesToNaf(criteria.roles)
  const departements = mapLocationsToDepartements(criteria.locations)
  const results: RawProspect[] = []

  // Strategy: search companies by NAF (profession-based) but flag as personne_physique
  // Liberal professionals always have a company/cabinet even if they are the target as individuals
  const nafList = nafCodes.length > 0 ? nafCodes : [undefined]
  const deptList = departements.length > 0 ? departements : [undefined]

  for (const naf of nafList.slice(0, 3)) {
    for (const dept of deptList.slice(0, 5)) {
      if (results.length >= limit) break
      const q = nafCodes.length === 0 ? keywords.join(' ') : undefined
      const { resultats } = await searchEntreprises({
        q,
        code_naf: naf,
        departement: dept,
        par_page: 20,
      })
      for (const ae of resultats) {
        if (results.length >= limit) break
        if (seen.has(ae.siren)) continue
        if (!ae.dirigeants?.length) continue
        seen.add(ae.siren)
        // Each dirigeant is a prospect as a physical person
        for (const dirigeant of ae.dirigeants) {
          if (results.length >= limit) break
          results.push(pappersToRawProspect(ae, dirigeant, 'personne_physique'))
        }
      }
    }
    if (results.length >= limit) break
  }

  // Supplement with Pappers recherche-dirigeants for keyword-based person search
  if (results.length < limit && keywords.length > 0) {
    const q = [...keywords, ...criteria.locations.slice(0, 2)].join(' ')
    const { resultats: personnes } = await searchPersonnes({ q, par_page: 20 })
    for (const personne of personnes) {
      if (results.length >= limit) break
      const entreprise = personne.entreprises?.[0]
      if (!entreprise) continue
      const uid = `${entreprise.siren}-${personne.nom}-${personne.prenom ?? ''}`
      if (seen.has(uid)) continue
      seen.add(uid)
      results.push({
        uid,
        source_type: 'personne_physique',
        entreprise_nom: entreprise.nom_entreprise,
        siren: entreprise.siren,
        code_naf: entreprise.code_naf ?? '',
        libelle_naf: entreprise.libelle_code_naf ?? '',
        date_creation: entreprise.date_creation ?? '',
        tranche_effectifs: '',
        adresse: entreprise.siege?.adresse_ligne_1 ?? '',
        code_postal: entreprise.siege?.code_postal ?? '',
        ville: entreprise.siege?.ville ?? '',
        departement: entreprise.siege?.departement ?? '',
        dirigeant_nom: personne.nom,
        dirigeant_prenom: personne.prenom ?? '',
        dirigeant_qualite: personne.qualite ?? 'professionnel libéral',
        dirigeant_annee_naissance: personne.annee_de_naissance
          ? parseInt(personne.annee_de_naissance)
          : undefined,
        linkedin_search_url: buildLinkedInSearchUrl(
          personne.prenom ?? '',
          personne.nom,
          entreprise.nom_entreprise
        ),
        score_initial: 40, // baseline for physically searched persons
      })
    }
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

  if (targetType === 'both') {
    const half = Math.ceil(limit / 2)
    const [morales, physiques] = await Promise.all([
      searchPersonnesMorales(criteria, half, seen),
      searchPersonnesPhysiques(criteria, half, seen),
    ])
    return [...morales, ...physiques].slice(0, limit)
  }

  if (targetType === 'personne_physique') {
    return searchPersonnesPhysiques(criteria, limit, seen)
  }

  return searchPersonnesMorales(criteria, limit, seen)
}
