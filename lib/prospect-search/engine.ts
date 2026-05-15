import {
  searchEntreprises as pappersSearchEntreprises,
  getEntrepriseRepresentants,
  searchPersonnes as pappersSearchPersonnes,
  type PappersEntreprise,
  type PappersRepresentant,
  type PappersPersonne,
} from '@/lib/data-sources/pappers'
import {
  searchEntreprises as aeSearchEntreprises,
  type AEResult,
  type AEDirigeant,
} from '@/lib/data-sources/annuaire-entreprises'
import {
  mapRolesToNaf,
  mapSectorsToNaf,
  mapLocationsToDepartements,
  expandWithAdjacent,
} from './naf-mapper'
import type { ParsedIcpCriteria } from '@/lib/types'

export interface RawProspect {
  uid: string
  source: 'pappers' | 'annuaire_entreprises'
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

function buildLinkedInUrl(prenom: string, nom: string, entreprise: string): string {
  const q = encodeURIComponent(`${prenom} ${nom} ${entreprise}`)
  return `https://www.linkedin.com/search/results/people/?keywords=${q}`
}

/**
 * Clé canonique person-level pour dédupliquer cross-source.
 *
 * Normalise diacritiques + casse + espaces, et utilise siren comme tiebreaker
 * (deux personnes nommées DURAND dans deux entreprises distinctes ne fusionnent
 * pas). Plus robuste que la clé dérivée de linkedin_url qui est sensible aux
 * variations de raison sociale entre Pappers et Annuaire Entreprises.
 */
export function canonicalPersonKey(prenom: string, nom: string, siren?: string): string {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{Mn}/gu, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  return `${norm(prenom)}|${norm(nom)}|${siren ?? '—'}`
}

// Derive department code from postal code (handles metropolitan + Corsica + DOM-TOM)
function deptFromCodePostal(cp?: string): string {
  if (!cp || cp.length < 2) return ''
  // Corsica: 20xxx → 2A (Corse-du-Sud, CP 200-201) or 2B (Haute-Corse, CP 202-206)
  if (cp.startsWith('20')) {
    const n = parseInt(cp.slice(0, 3))
    if (n >= 200 && n <= 201) return '2A'
    if (n >= 202 && n <= 206) return '2B'
  }
  // DOM-TOM: 97x or 98x → 3-digit dept code
  if (cp.startsWith('97') || cp.startsWith('98')) return cp.slice(0, 3)
  return cp.slice(0, 2)
}

// ── Filters ──────────────────────────────────────────────────────────────────

// NAFs that target individual practitioners → exclude large entities
const LIBERAL_NAF_PREFIXES = ['86', '87', '75.00', '69.10', '69.20', '71.11', '70.22']

function isLiberalTarget(codeNaf: string): boolean {
  return LIBERAL_NAF_PREFIXES.some(p => codeNaf.startsWith(p))
}

const CORPORATE_NAME_BLOCKLIST = [
  'FEDERATION',
  'FÉDÉRATION',
  'ASSOCIATION NATIONALE',
  'CAISSE',
  'SYNDICAT',
  'CONFEDERATION',
  'CONFÉDÉRATION',
  'CONSEIL NATIONAL',
  'CHAMBRE NATIONALE',
  'UNION NATIONALE',
  'INSTITUT NATIONAL',
  'CENTRE HOSPITALIER',
  'HOPITAL',
  'HÔPITAL',
]

function isInstitutional(name: string): boolean {
  const upper = name.toUpperCase()
  return CORPORATE_NAME_BLOCKLIST.some(b => upper.includes(b))
}

/**
 * Décode une tranche d'effectif (format AE: "00", "11", "21"...) ou un libellé
 * Pappers ("10 à 19 salariés") en une paire min/max approximative.
 * Retourne null si non décodable.
 */
export function parseEffectifTranche(input: string): { min: number; max: number } | null {
  if (!input) return null
  const AE_TRANCHE: Record<string, [number, number]> = {
    '00': [0, 0],
    '01': [1, 2],
    '02': [3, 5],
    '03': [6, 9],
    '11': [10, 19],
    '12': [20, 49],
    '21': [50, 99],
    '22': [100, 199],
    '31': [200, 249],
    '32': [250, 499],
    '41': [500, 999],
    '42': [1000, 1999],
    '51': [2000, 4999],
    '52': [5000, 9999],
    '53': [10000, 999999],
  }
  if (AE_TRANCHE[input]) {
    const [min, max] = AE_TRANCHE[input]
    return { min, max }
  }
  const range = input.match(/(\d+)\s*[àà-]\s*(\d+)/i)
  if (range) return { min: parseInt(range[1]), max: parseInt(range[2]) }
  const single = input.match(/(\d+)/)
  if (single) {
    const n = parseInt(single[1])
    return { min: n, max: n }
  }
  return null
}

/**
 * Filtres durs : effectif min/max, âge min/max.
 * Le filtre département est appliqué séparément. Le filtre CA n'est pas
 * applicable ici (données financières disponibles post-enrichissement seulement).
 */
function passesHardFilters(p: RawProspect, criteria: ParsedIcpCriteria): boolean {
  if (criteria.effectif_min != null || criteria.effectif_max != null) {
    const eff = parseEffectifTranche(p.tranche_effectifs)
    if (eff) {
      if (criteria.effectif_min != null && eff.max < criteria.effectif_min) return false
      if (criteria.effectif_max != null && eff.min > criteria.effectif_max) return false
    }
    // Si on a un seuil mais qu'on n'a aucune info effectif : tolérance
    // (l'absence n'est pas une exclusion, sinon trop de faux négatifs).
  }
  if (p.dirigeant_annee_naissance) {
    const age = new Date().getFullYear() - p.dirigeant_annee_naissance
    if (criteria.age_min != null && age < criteria.age_min) return false
    if (criteria.age_max != null && age > criteria.age_max) return false
  }
  return true
}

// Exclude large or institutional entities when the ICP targets libéraux
function shouldExcludeFromLiberal(opts: {
  codeNaf: string
  entrepriseNom: string
  trancheEffectif?: string  // AE code (11, 12, 21...) or Pappers string
  effectifMax?: number       // Pappers numeric
  categorieEntreprise?: string  // AE: PME, ETI, GE
}): boolean {
  if (!isLiberalTarget(opts.codeNaf)) return false
  if (isInstitutional(opts.entrepriseNom)) return true
  if (opts.categorieEntreprise === 'GE' || opts.categorieEntreprise === 'ETI') return true
  if (opts.effectifMax != null && opts.effectifMax > 50) return true
  if (opts.trancheEffectif) {
    const code = parseInt(opts.trancheEffectif)
    if (!isNaN(code) && code >= 41) return true
  }
  return false
}

// Export pour les tests vitest
export const _internals = {
  shouldExcludeFromLiberal,
  passesHardFilters,
  isLiberalTarget,
  isInstitutional,
}

// ── NAF / location resolution ────────────────────────────────────────────────

/**
 * Fusionne les codes NAF dérivés des roles ET des sectors (corrige le bug
 * silencieux où criteria.sectors était parsé mais jamais lu).
 */
function resolveNafCodes(criteria: ParsedIcpCriteria): { codes: string[]; keywords: string[] } {
  const fromRoles = mapRolesToNaf(criteria.roles)
  const fromSectors = mapSectorsToNaf(criteria.sectors)
  const codes = new Set([...fromRoles.codes, ...fromSectors])
  return { codes: Array.from(codes), keywords: fromRoles.keywords }
}

/**
 * Résout les départements cibles. Par défaut, élargit aux voisins immédiats
 * pour ne pas écarter des prospects à 30km. Désactivable via geo_strict.
 */
function resolveDepartements(criteria: ParsedIcpCriteria): {
  effective: string[]
  strict: string[]
} {
  const strict = mapLocationsToDepartements(criteria.locations)
  if (criteria.geo_strict || strict.length === 0) return { effective: strict, strict }
  return { effective: expandWithAdjacent(strict), strict }
}

// ── Pappers — personne morale ────────────────────────────────────────────────

function anneeNaissancePappers(rep: PappersRepresentant): number | undefined {
  const raw = rep.date_de_naissance ?? rep.date_de_naissance_rgpd
  if (!raw) return undefined
  const year = parseInt(raw.slice(0, 4))
  return isNaN(year) ? undefined : year
}

function scorePappers(ae: PappersEntreprise, rep: PappersRepresentant): number {
  let score = 20
  if (ae.date_creation) {
    const years = new Date().getFullYear() - new Date(ae.date_creation).getFullYear()
    if (years >= 10) score += 20
    else if (years >= 5) score += 10
    else score += 5
  }
  const naf = ae.code_naf ?? ''
  if (naf.startsWith('86') || naf.startsWith('69')) score += 20
  else if (naf.startsWith('71') || naf.startsWith('75')) score += 10
  if (ae.capital && ae.capital >= 100_000) score += 15
  else if (ae.capital && ae.capital >= 10_000) score += 8
  if (ae.effectif_max && ae.effectif_max >= 20) score += 15
  else if (ae.effectif_max && ae.effectif_max >= 5) score += 8
  const annee = anneeNaissancePappers(rep)
  if (annee) {
    const age = new Date().getFullYear() - annee
    if (age >= 45 && age <= 65) score += 15
    else if (age >= 35 && age < 45) score += 10
  }
  return Math.min(score, 75)
}

function fromPappers(ae: PappersEntreprise, rep: PappersRepresentant): RawProspect {
  const prenom = rep.prenom_usuel ?? rep.prenom?.split(/[,\s]+/)[0] ?? ''
  const nom = rep.nom ?? ''
  const codePostal = ae.siege?.code_postal ?? ''
  return {
    uid: canonicalPersonKey(prenom, nom, ae.siren),
    source: 'pappers',
    source_type: 'personne_morale',
    entreprise_nom: ae.nom_entreprise,
    siren: ae.siren,
    code_naf: ae.code_naf ?? '',
    libelle_naf: ae.libelle_code_naf ?? '',
    date_creation: ae.date_creation ?? '',
    tranche_effectifs: ae.tranche_effectif ?? '',
    adresse: ae.siege?.adresse_ligne_1 ?? '',
    code_postal: codePostal,
    ville: ae.siege?.ville ?? '',
    departement: ae.siege?.departement ?? deptFromCodePostal(codePostal),
    dirigeant_nom: nom,
    dirigeant_prenom: prenom,
    dirigeant_qualite: rep.qualite ?? 'dirigeant',
    dirigeant_annee_naissance: anneeNaissancePappers(rep),
    linkedin_search_url: buildLinkedInUrl(prenom, nom, ae.nom_entreprise),
    score_initial: scorePappers(ae, rep),
  }
}

async function searchFromPappers(
  criteria: ParsedIcpCriteria,
  limit: number,
  allowedDepts: Set<string>,
): Promise<RawProspect[]> {
  const { codes: nafCodes, keywords } = resolveNafCodes(criteria)
  const departements = Array.from(allowedDepts)
  const seen = new Set<string>()
  const results: RawProspect[] = []

  const nafList = nafCodes.length > 0 ? nafCodes : [undefined]
  const deptList = departements.length > 0 ? departements : [undefined]

  outer: for (const naf of nafList.slice(0, 4)) {
    for (const dept of deptList) {
      if (results.length >= limit) break outer
      const q = nafCodes.length === 0 ? keywords.join(' ') : undefined
      const { resultats } = await pappersSearchEntreprises({ q, code_naf: naf, departement: dept, par_page: 20 })

      const candidates = resultats
        .filter(ae => {
          if (seen.has(ae.siren)) return false
          if ((ae.nb_dirigeants_total ?? 1) === 0) return false
          const dept = ae.siege?.departement ?? deptFromCodePostal(ae.siege?.code_postal)
          if (allowedDepts.size > 0 && dept && !allowedDepts.has(dept)) return false
          if (shouldExcludeFromLiberal({
            codeNaf: ae.code_naf ?? '',
            entrepriseNom: ae.nom_entreprise ?? '',
            trancheEffectif: ae.tranche_effectif,
            effectifMax: ae.effectif_max,
          })) return false
          return true
        })
        .slice(0, limit - results.length + 5)

      const enriched = await Promise.allSettled(
        candidates.map(async ae => ({ ae, reps: await getEntrepriseRepresentants(ae.siren) }))
      )

      for (const r of enriched) {
        if (r.status === 'rejected' || !r.value.reps.length) continue
        const { ae, reps } = r.value
        seen.add(ae.siren)
        for (const rep of reps.slice(0, 2)) {
          if (results.length >= limit) break
          const prospect = fromPappers(ae, rep)
          if (!seen.has(prospect.uid) && passesHardFilters(prospect, criteria)) {
            seen.add(prospect.uid)
            results.push(prospect)
          }
        }
      }
    }
  }
  return results
}

// ── Pappers — personne physique (NOUVEAU, corrige le bug bloquant) ──────────

function fromPappersPersonne(personne: PappersPersonne): RawProspect | null {
  if (!personne.nom) return null
  const entreprise = personne.entreprises?.[0]
  if (!entreprise) return null

  const prenom = personne.prenom?.split(/[\s,]+/)[0] ?? ''
  const nom = personne.nom
  const codePostal = entreprise.siege?.code_postal ?? ''

  return {
    uid: canonicalPersonKey(prenom, nom, entreprise.siren),
    source: 'pappers',
    source_type: 'personne_physique',
    entreprise_nom: entreprise.nom_entreprise,
    siren: entreprise.siren,
    code_naf: entreprise.code_naf ?? '',
    libelle_naf: entreprise.libelle_code_naf ?? '',
    date_creation: entreprise.date_creation ?? '',
    tranche_effectifs: '',
    adresse: entreprise.siege?.adresse_ligne_1 ?? '',
    code_postal: codePostal,
    ville: entreprise.siege?.ville ?? '',
    departement: entreprise.siege?.departement ?? deptFromCodePostal(codePostal),
    dirigeant_nom: nom,
    dirigeant_prenom: prenom,
    dirigeant_qualite: personne.qualite ?? 'dirigeant',
    linkedin_search_url: buildLinkedInUrl(prenom, nom, entreprise.nom_entreprise),
    score_initial: 35, // baseline — sera affiné post-enrichissement
  }
}

async function searchFromPappersPersonnes(
  criteria: ParsedIcpCriteria,
  limit: number,
  allowedDepts: Set<string>,
): Promise<RawProspect[]> {
  const { keywords } = resolveNafCodes(criteria)
  // Si on a des keywords issus du NAF mapper, on les utilise comme requêtes.
  // Sinon fallback sur les roles bruts (texte libre dans /recherche-dirigeants).
  const queries = keywords.length > 0 ? keywords.slice(0, 3) : criteria.roles.slice(0, 3)
  if (queries.length === 0) return []

  const seen = new Set<string>()
  const results: RawProspect[] = []

  for (const q of queries) {
    if (results.length >= limit) break
    const { resultats } = await pappersSearchPersonnes({ q, par_page: 25 })

    for (const personne of resultats) {
      if (results.length >= limit) break
      const prospect = fromPappersPersonne(personne)
      if (!prospect) continue

      // Filtre département (la recherche-dirigeants Pappers n'a pas de
      // paramètre departement, donc filtrage en post)
      if (allowedDepts.size > 0 && prospect.departement && !allowedDepts.has(prospect.departement)) {
        continue
      }
      if (seen.has(prospect.uid)) continue
      if (!passesHardFilters(prospect, criteria)) continue
      seen.add(prospect.uid)
      results.push(prospect)
    }
  }
  return results
}

// ── Annuaire Entreprises ──────────────────────────────────────────────────────

function anneeNaissanceAE(d: AEDirigeant): number | undefined {
  if (d.annee_de_naissance) {
    const y = parseInt(d.annee_de_naissance)
    return isNaN(y) ? undefined : y
  }
  if (d.date_naissance_timestamp_utc) {
    return new Date(parseInt(d.date_naissance_timestamp_utc) * 1000).getFullYear()
  }
  return undefined
}

function scoreAE(ae: AEResult, d: AEDirigeant): number {
  let score = 20
  if (ae.date_creation) {
    const years = new Date().getFullYear() - new Date(ae.date_creation).getFullYear()
    if (years >= 10) score += 20
    else if (years >= 5) score += 10
    else score += 5
  }
  const naf = ae.activite_principale ?? ''
  if (naf.startsWith('86') || naf.startsWith('69')) score += 20
  else if (naf.startsWith('71') || naf.startsWith('75')) score += 10
  const tranche = parseInt(ae.tranche_effectif_salarie ?? '0')
  if (tranche >= 32) score += 15
  else if (tranche >= 21) score += 8
  const annee = anneeNaissanceAE(d)
  if (annee) {
    const age = new Date().getFullYear() - annee
    if (age >= 45 && age <= 65) score += 15
    else if (age >= 35 && age < 45) score += 10
  }
  return Math.min(score, 75)
}

function fromAE(ae: AEResult, d: AEDirigeant): RawProspect {
  const prenom = d.prenoms?.split(/[\s,]+/)[0] ?? ''
  const nom = d.nom ?? ''
  return {
    uid: canonicalPersonKey(prenom, nom, ae.siren),
    source: 'annuaire_entreprises',
    source_type: 'personne_morale',
    entreprise_nom: ae.nom_complet,
    siren: ae.siren,
    code_naf: ae.activite_principale ?? '',
    libelle_naf: ae.libelle_activite_principale ?? '',
    date_creation: ae.date_creation ?? '',
    tranche_effectifs: ae.tranche_effectif_salarie ?? '',
    adresse: ae.siege.adresse ?? '',
    code_postal: ae.siege.code_postal ?? '',
    ville: ae.siege.libelle_commune ?? ae.siege.commune ?? '',
    departement: ae.siege.departement ?? deptFromCodePostal(ae.siege.code_postal),
    dirigeant_nom: nom,
    dirigeant_prenom: prenom,
    dirigeant_qualite: d.qualite,
    dirigeant_annee_naissance: anneeNaissanceAE(d),
    linkedin_search_url: buildLinkedInUrl(prenom, nom, ae.nom_complet),
    score_initial: scoreAE(ae, d),
  }
}

async function searchFromAE(
  criteria: ParsedIcpCriteria,
  limit: number,
  allowedDepts: Set<string>,
): Promise<RawProspect[]> {
  const { codes: nafCodes, keywords } = resolveNafCodes(criteria)
  const departements = Array.from(allowedDepts)
  const seen = new Set<string>()
  const results: RawProspect[] = []

  const nafList = nafCodes.length > 0 ? nafCodes : [undefined]
  const deptList = departements.length > 0 ? departements : [undefined]

  outer: for (const naf of nafList.slice(0, 4)) {
    for (const dept of deptList) {
      if (results.length >= limit) break outer
      const q = keywords.length > 0 ? keywords.slice(0, 2).join(' ') : undefined
      const { results: aeResults } = await aeSearchEntreprises({
        q,
        activite_principale: naf,
        departement: dept,
        per_page: 25,
      })

      for (const ae of aeResults) {
        if (results.length >= limit) break
        if (allowedDepts.size > 0 && ae.siege?.departement && !allowedDepts.has(ae.siege.departement)) {
          continue
        }
        if (shouldExcludeFromLiberal({
          codeNaf: ae.activite_principale ?? '',
          entrepriseNom: ae.nom_complet ?? '',
          trancheEffectif: ae.tranche_effectif_salarie,
          categorieEntreprise: ae.categorie_entreprise,
        })) continue

        const dirigeants = (ae.dirigeants ?? []).filter(d => d.nom)
        for (const d of dirigeants.slice(0, 2)) {
          if (results.length >= limit) break
          const prospect = fromAE(ae, d)
          if (!seen.has(prospect.uid) && passesHardFilters(prospect, criteria)) {
            seen.add(prospect.uid)
            results.push(prospect)
          }
        }
      }
    }
  }
  return results
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Routeur principal de recherche prospect.
 *
 *  - target_type === 'personne_morale' (défaut) → flow société→dirigeants
 *    (Pappers /recherche + Annuaire Entreprises, en parallèle).
 *  - target_type === 'personne_physique' → flow Pappers /recherche-dirigeants
 *    (cherche les personnes directement, agrège leur entreprise principale).
 *  - target_type === 'both' → les deux flows en parallèle, dédup canonique.
 *
 * Adjacence départementale activée par défaut (criteria.geo_strict = true pour
 * désactiver). Filtres durs effectif/âge appliqués post-fetch.
 */
export async function searchProspects(
  criteria: ParsedIcpCriteria,
  options: { limit?: number } = {}
): Promise<RawProspect[]> {
  const limit = options.limit ?? 30
  const { effective } = resolveDepartements(criteria)
  const allowedDepts = new Set(effective)

  const targetType = criteria.target_type ?? 'personne_morale'
  const tasks: Array<Promise<RawProspect[]>> = []

  if (targetType === 'personne_morale' || targetType === 'both') {
    const half = Math.ceil(limit / (targetType === 'both' ? 3 : 2))
    tasks.push(searchFromPappers(criteria, half, allowedDepts))
    tasks.push(searchFromAE(criteria, half, allowedDepts))
  }
  if (targetType === 'personne_physique' || targetType === 'both') {
    const slice = targetType === 'both' ? Math.ceil(limit / 3) : limit
    tasks.push(searchFromPappersPersonnes(criteria, slice, allowedDepts))
  }

  const settled = await Promise.allSettled(tasks)
  const allResults: RawProspect[] = []
  for (const s of settled) {
    if (s.status === 'fulfilled') allResults.push(...s.value)
  }

  // Dédup canonique cross-source (même personne via Pappers + AE → 1 entrée)
  const seen = new Set<string>()
  const merged: RawProspect[] = []
  for (const p of allResults) {
    if (!p.dirigeant_nom) continue
    if (!seen.has(p.uid)) {
      seen.add(p.uid)
      merged.push(p)
    }
  }

  // Filtre département final (au cas où une source aurait laissé passer)
  const filtered = allowedDepts.size > 0
    ? merged.filter(p => !p.departement || allowedDepts.has(p.departement))
    : merged

  return filtered
    .sort((a, b) => b.score_initial - a.score_initial)
    .slice(0, limit)
}
