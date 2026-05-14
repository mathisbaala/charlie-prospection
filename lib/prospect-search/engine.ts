import {
  searchEntreprises as pappersSearchEntreprises,
  getEntrepriseRepresentants,
  type PappersEntreprise,
  type PappersRepresentant,
} from '@/lib/data-sources/pappers'
import {
  searchEntreprises as aeSearchEntreprises,
  type AEResult,
  type AEDirigeant,
} from '@/lib/data-sources/annuaire-entreprises'
import { mapRolesToNaf, mapLocationsToDepartements } from './naf-mapper'
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

function personUid(siren: string, nom: string, prenom: string): string {
  return `${siren}-${nom.toLowerCase().trim()}-${prenom.toLowerCase().trim()}`
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
  // AE: GE / ETI = too large for libéral target
  if (opts.categorieEntreprise === 'GE' || opts.categorieEntreprise === 'ETI') return true
  // Pappers: > 50 employees
  if (opts.effectifMax != null && opts.effectifMax > 50) return true
  // AE tranche codes: 41=100-199, 42=200-249... reject ≥ 41
  if (opts.trancheEffectif) {
    const code = parseInt(opts.trancheEffectif)
    if (!isNaN(code) && code >= 41) return true
  }
  return false
}

// ── Pappers ──────────────────────────────────────────────────────────────────

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
    uid: personUid(ae.siren, nom, prenom),
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
  const { codes: nafCodes, keywords } = mapRolesToNaf(criteria.roles)
  const departements = mapLocationsToDepartements(criteria.locations)
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
          // Strict dept match: company siège must be in requested dept
          // Pappers /recherche doesn't return siege.departement directly — derive from code_postal
          const dept = ae.siege?.departement ?? deptFromCodePostal(ae.siege?.code_postal)
          if (allowedDepts.size > 0 && dept && !allowedDepts.has(dept)) {
            return false
          }
          // Exclude large/institutional entities for libéral ICPs
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
          if (!seen.has(prospect.uid)) {
            seen.add(prospect.uid)
            results.push(prospect)
          }
        }
      }
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
    uid: personUid(ae.siren, nom, prenom),
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
  const { codes: nafCodes, keywords } = mapRolesToNaf(criteria.roles)
  const departements = mapLocationsToDepartements(criteria.locations)
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
        // Strict dept match: siège must be in requested dept
        if (allowedDepts.size > 0 && ae.siege?.departement && !allowedDepts.has(ae.siege.departement)) {
          continue
        }
        // Exclude large/institutional entities for libéral ICPs
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
          if (!seen.has(prospect.uid)) {
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

export async function searchProspects(
  criteria: ParsedIcpCriteria,
  options: { limit?: number } = {}
): Promise<RawProspect[]> {
  const limit = options.limit ?? 30
  const half = Math.ceil(limit / 2)
  const departements = mapLocationsToDepartements(criteria.locations)
  const allowedDepts = new Set(departements)

  const [fromPappersResults, fromAEResults] = await Promise.allSettled([
    searchFromPappers(criteria, half, allowedDepts),
    searchFromAE(criteria, half, allowedDepts),
  ])

  const pappersProspects = fromPappersResults.status === 'fulfilled' ? fromPappersResults.value : []
  const aeProspects = fromAEResults.status === 'fulfilled' ? fromAEResults.value : []

  // Merge, deduplicate across sources by uid (same person from different sources)
  const seen = new Set<string>()
  const merged: RawProspect[] = []
  for (const p of [...pappersProspects, ...aeProspects]) {
    if (!seen.has(p.uid) && p.dirigeant_nom) {
      seen.add(p.uid)
      merged.push(p)
    }
  }

  // Final hard filter: dept must match if user specified locations
  const filtered = allowedDepts.size > 0
    ? merged.filter(p => !p.departement || allowedDepts.has(p.departement))
    : merged

  return filtered
    .sort((a, b) => b.score_initial - a.score_initial)
    .slice(0, limit)
}
