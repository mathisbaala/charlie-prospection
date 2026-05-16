import { createClient } from '@/lib/supabase/server'
import {
  searchEntreprises,
  getEntrepriseRepresentants,
} from '@/lib/data-sources/pappers'
import { rawProspectFromPappers } from '@/lib/prospect-search/engine'
import type { DiscoverySource, DiscoveryParams } from './types'
import type { RawProspect } from '@/lib/prospect-search/engine'
import type { RppsData } from '@/lib/types'

const DEFAULT_LIMIT = 20
const MATCH_THRESHOLD = 70

interface RppsRow {
  rpps_id: string
  nom: string
  prenom: string | null
  profession: string
  specialite: string | null
  mode_exercice: string
  ville: string | null
  code_postal: string | null
}

interface MatchTarget {
  nom: string
  prenom_usuel?: string
  prenom?: string
  nom_entreprise?: string
  siege?: {
    ville?: string
    departement?: string
  }
}

export function computeRppsMatchScore(
  rpps: { nom: string; prenom: string; ville: string | null; dept: string },
  ae: MatchTarget,
): number {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{Mn}/gu, '')
      .toUpperCase()
      .trim()

  let score = 0

  if (norm(ae.nom ?? '') === norm(rpps.nom)) score += 50

  const pappersPrenom = norm(ae.prenom_usuel ?? ae.prenom ?? '')
  const rppsPrenom = norm(rpps.prenom)
  if (pappersPrenom && rppsPrenom) {
    if (pappersPrenom === rppsPrenom) {
      score += 20
    } else if (pappersPrenom.length === 1 && rppsPrenom.startsWith(pappersPrenom)) {
      score += 10
    } else if (rppsPrenom.length === 1 && pappersPrenom.startsWith(rppsPrenom)) {
      score += 10
    }
  }

  const aeDept = ae.siege?.departement ?? ''
  const aeVille = norm(ae.siege?.ville ?? '')
  const rppsVille = norm(rpps.ville ?? '')
  if (rppsVille && aeVille && aeVille === rppsVille) {
    score += 20
  } else if (aeDept && rpps.dept && aeDept === rpps.dept) {
    score += 10
  }

  const nomE = norm(ae.nom_entreprise ?? '')
  if (
    nomE.includes('SELARL') || nomE.includes('SCP') || nomE.includes('SEL ') ||
    nomE.includes('PHARMACIE') || nomE.includes('OFFICINE') ||
    nomE.includes('CABINET') || nomE.includes('KINESITHER')
  ) {
    score += 10
  }

  return score
}

function toRppsData(row: RppsRow): RppsData {
  return {
    identifiant: row.rpps_id,
    profession: row.profession,
    categorie_professionnelle: row.specialite ?? undefined,
    mode_exercice: row.mode_exercice,
    cabinet_commune: row.ville ?? undefined,
    cabinet_code_postal: row.code_postal ?? undefined,
  }
}

async function matchToProspect(
  row: RppsRow,
  dept: string,
): Promise<(RawProspect & { _rppsData: RppsData }) | null> {
  const query = `${row.prenom ?? ''} ${row.nom}`.trim()
  const { resultats } = await searchEntreprises({ q: query, departement: dept, par_page: 5 })

  for (const ae of resultats) {
    const reps = await getEntrepriseRepresentants(ae.siren)
    const physicals = reps.filter((r) => !r.personne_morale)
    if (!physicals.length) continue

    const rep = physicals[0]
    const score = computeRppsMatchScore(
      { nom: row.nom, prenom: row.prenom ?? '', ville: row.ville, dept },
      {
        nom: rep.nom,
        prenom_usuel: rep.prenom_usuel,
        prenom: rep.prenom,
        nom_entreprise: ae.nom_entreprise,
        siege: ae.siege,
      },
    )

    if (score < MATCH_THRESHOLD) continue

    const prospect = rawProspectFromPappers(ae, rep, 'rpps')
    return Object.assign(prospect, { _rppsData: toRppsData(row) })
  }

  return null
}

export const rppsSource: DiscoverySource = {
  name: 'rpps',

  async discover(params: DiscoveryParams): Promise<RawProspect[]> {
    const dept = params.departement
    if (!dept) return []

    const limit = params.limit ?? DEFAULT_LIMIT
    const supabase = await createClient()

    const PROFESSION_LABEL: Record<string, string> = {
      Medecin: 'Médecin',
      'Chirurgien-Dentiste': 'Chirurgien-Dentiste',
      Pharmacien: 'Pharmacien',
      Kinesitherapeute: 'Masseur-Kinésithérapeute',
      'Sage-Femme': 'Sage-Femme',
    }
    const professionFilter = params.profession ? (PROFESSION_LABEL[params.profession] ?? null) : null

    const { data: rows, error } = await supabase
      .from('prospection_rpps_cache')
      .select('rpps_id, nom, prenom, profession, specialite, mode_exercice, ville, code_postal')
      .eq('mode_exercice', 'L')
      .ilike('code_postal', `${dept}%`)
      .limit(limit * 3)

    if (error || !rows?.length) return []

    const candidates = professionFilter
      ? (rows as RppsRow[]).filter((r) =>
          r.profession.toLowerCase().includes(professionFilter.toLowerCase()),
        )
      : (rows as RppsRow[])

    const seen = new Set<string>()
    const results: RawProspect[] = []

    const settled = await Promise.allSettled(
      candidates.slice(0, limit * 2).map((row) => matchToProspect(row, dept)),
    )

    for (const r of settled) {
      if (results.length >= limit) break
      if (r.status === 'rejected' || !r.value) continue
      const prospect = r.value
      if (seen.has(prospect.uid)) continue
      seen.add(prospect.uid)
      results.push(prospect)
    }

    return results
  },
}
