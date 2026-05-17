import { timedFetch } from '@/lib/observability/logger'

// Geo-DVF — fichiers CSV publiés par la DGFIP via data.gouv.fr
// Remplace api.dvf.etalab.gouv.fr (NXDOMAIN depuis 2025)
// Structure : {BASE}/{year}/communes/{dept}/{commune}.csv
// Exemple   : .../2024/communes/69/69123.csv
const GEO_DVF_BASE = 'https://files.data.gouv.fr/geo-dvf/2025-12/csv'
const CANDIDATE_YEARS = [2024, 2023, 2022] as const

export interface DvfRecord {
  id_mutation: string
  date_mutation: string
  nature_mutation: string
  valeur_fonciere: number
  adresse_numero?: string
  adresse_voie?: string
  code_commune: string
  nom_commune: string
  code_departement: string
  type_local?: string
  surface_reelle_bati?: number
  nombre_pieces_principales?: number
}

function deptFromCommune(codeCommune: string): string {
  // DOM : codes commençant par 971-976 → 3 caractères
  if (/^97[1-6]/.test(codeCommune)) return codeCommune.slice(0, 3)
  return codeCommune.slice(0, 2)
}

function parseCsv(text: string): DvfRecord[] {
  const lines = text.split('\n')
  if (lines.length < 2) return []

  const sep = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(sep).map((h) => h.trim().replace(/"/g, '').toLowerCase())

  const col = (name: string) => headers.indexOf(name)
  const iId = col('id_mutation')
  const iDate = col('date_mutation')
  const iNature = col('nature_mutation')
  const iValeur = col('valeur_fonciere')
  const iNumero = col('adresse_numero')
  const iVoie = col('adresse_nom_voie')    // nom du champ dans les CSV geo-dvf
  const iCodeCommune = col('code_commune')
  const iNomCommune = col('nom_commune')
  const iCodeDept = col('code_departement')
  const iTypeLocal = col('type_local')
  const iSurface = col('surface_reelle_bati')
  const iPieces = col('nombre_pieces_principales')

  if (iId === -1 || iDate === -1 || iValeur === -1) return []

  const records: DvfRecord[] = []
  const seen = new Set<string>()

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]
    if (!raw.trim()) continue
    const cells = raw.split(sep)

    const cell = (idx: number) =>
      idx >= 0 ? (cells[idx]?.trim().replace(/^"|"$/g, '') ?? '') : ''

    const idMutation = cell(iId)
    if (!idMutation) continue
    // DVF : plusieurs lignes par mutation (une par lot) — on déduplique
    if (seen.has(idMutation)) continue
    seen.add(idMutation)

    // Séparateur décimal français : virgule → point
    const valeur = parseFloat(cell(iValeur).replace(',', '.')) || 0
    const surface = cell(iSurface) ? parseFloat(cell(iSurface).replace(',', '.')) : undefined
    const pieces = cell(iPieces) ? parseInt(cell(iPieces)) : undefined

    records.push({
      id_mutation: idMutation,
      date_mutation: cell(iDate),
      nature_mutation: cell(iNature),
      valeur_fonciere: valeur,
      adresse_numero: cell(iNumero) || undefined,
      adresse_voie: cell(iVoie) || undefined,
      code_commune: cell(iCodeCommune),
      nom_commune: cell(iNomCommune),
      code_departement: cell(iCodeDept),
      type_local: cell(iTypeLocal) || undefined,
      surface_reelle_bati: surface,
      nombre_pieces_principales: pieces,
    })
  }

  return records
}

async function fetchDvfCsv(codeCommune: string): Promise<DvfRecord[]> {
  const dept = deptFromCommune(codeCommune)

  for (const year of CANDIDATE_YEARS) {
    const url = `${GEO_DVF_BASE}/${year}/communes/${dept}/${codeCommune}.csv`
    try {
      const res = await timedFetch('dvf', 'fetchDvfCsv', url, {
        next: { revalidate: 86400 * 30 }, // données historiques stables
      })
      if (!res.ok) continue
      const text = await res.text()
      const records = parseCsv(text)
      if (records.length > 0) return records
    } catch {
      continue
    }
  }
  return []
}

export async function getDvfByCommune(codeCommune: string, minValeur = 0, limit = 20): Promise<DvfRecord[]> {
  try {
    const records = await fetchDvfCsv(codeCommune)
    return records
      .filter((r) => r.valeur_fonciere >= minValeur)
      .sort((a, b) => b.date_mutation.localeCompare(a.date_mutation))
      .slice(0, limit)
  } catch {
    return []
  }
}

// ── DVF perso — matching par adresse ─────────────────────────────────────────
//
// DVF ne porte pas le SIREN du propriétaire — on ne peut jamais être CERTAIN
// qu'une mutation concerne le prospect. On liste les mutations à l'adresse du
// siège social. Confiance heuristique, affiché en fiche uniquement (hors score).

export type DvfMatchConfidence = 'low' | 'medium' | 'high'

export interface DvfPersoCandidate {
  date_mutation: string
  nature_mutation: string
  valeur_fonciere: number
  type_local: string
  surface_reelle_bati?: number
  adresse_complete: string
  match_confidence: DvfMatchConfidence
  match_reason: string
}

function normalizeAddressFragment(s: string | undefined): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/\b(de|du|de la|de l'|de l|la|le|les|l'|l)\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreAddressMatch(
  targetNumero: string,
  targetVoie: string,
  recordNumero: string,
  recordVoie: string,
): { confidence: DvfMatchConfidence; reason: string } | null {
  const tVoie = normalizeAddressFragment(targetVoie)
  const rVoie = normalizeAddressFragment(recordVoie)
  if (!tVoie || !rVoie) return null

  const voieExact = tVoie === rVoie
  const voieContained = !voieExact && (tVoie.includes(rVoie) || rVoie.includes(tVoie))
  const voieTokensOverlap = !voieExact && !voieContained && shareSignificantToken(tVoie, rVoie)

  if (!voieExact && !voieContained && !voieTokensOverlap) return null

  const tNum = (targetNumero ?? '').trim()
  const rNum = (recordNumero ?? '').trim()

  if (voieExact && tNum && rNum && tNum === rNum) {
    return { confidence: 'high', reason: 'Numéro et voie exacts' }
  }
  if (voieExact && (!tNum || !rNum)) {
    return { confidence: 'medium', reason: 'Voie exacte, numéro non comparé' }
  }
  if (voieExact) {
    return { confidence: 'medium', reason: `Voie exacte, numéros différents (${tNum} vs ${rNum})` }
  }
  if (voieContained) {
    return {
      confidence: tNum && rNum && tNum === rNum ? 'medium' : 'low',
      reason: 'Voie partiellement comparable',
    }
  }
  return { confidence: 'low', reason: 'Recouvrement faible sur la voie' }
}

function shareSignificantToken(a: string, b: string): boolean {
  const stop = new Set(['rue', 'avenue', 'av', 'bd', 'boulevard', 'place', 'allee', 'allee', 'chemin', 'route', 'impasse', 'cours', 'quai', 'square'])
  const tokensA = a.split(' ').filter((t) => t.length >= 4 && !stop.has(t))
  const tokensB = new Set(b.split(' ').filter((t) => t.length >= 4 && !stop.has(t)))
  return tokensA.some((t) => tokensB.has(t))
}

export async function getDvfByAddress(params: {
  codeCommune: string
  adresseVoie: string
  adresseNumero?: string
  pageSize?: number
  minConfidence?: DvfMatchConfidence
}): Promise<DvfPersoCandidate[]> {
  if (!params.codeCommune || !params.adresseVoie) return []

  try {
    const records = await fetchDvfCsv(params.codeCommune)

    const order: Record<DvfMatchConfidence, number> = { high: 3, medium: 2, low: 1 }
    const floor = order[params.minConfidence ?? 'low']

    const matches: DvfPersoCandidate[] = []
    for (const r of records) {
      const scored = scoreAddressMatch(
        params.adresseNumero ?? '',
        params.adresseVoie,
        r.adresse_numero ?? '',
        r.adresse_voie ?? '',
      )
      if (!scored) continue
      if (order[scored.confidence] < floor) continue

      const addrParts = [r.adresse_numero, r.adresse_voie, r.nom_commune].filter(Boolean).join(' ')
      matches.push({
        date_mutation: r.date_mutation,
        nature_mutation: r.nature_mutation,
        valeur_fonciere: r.valeur_fonciere,
        type_local: r.type_local ?? 'bien',
        surface_reelle_bati: r.surface_reelle_bati,
        adresse_complete: addrParts.trim(),
        match_confidence: scored.confidence,
        match_reason: scored.reason,
      })
    }

    matches.sort((a, b) => {
      const byConf = order[b.match_confidence] - order[a.match_confidence]
      if (byConf !== 0) return byConf
      return b.date_mutation.localeCompare(a.date_mutation)
    })

    return matches
  } catch {
    return []
  }
}
