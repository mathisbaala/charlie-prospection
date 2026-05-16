import { timedFetch } from '@/lib/observability/logger'

const BASE = 'https://api.dvf.etalab.gouv.fr/dvf/1.0'

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

export async function getDvfByCommune(codeCommune: string, minValeur = 0, limit = 20): Promise<DvfRecord[]> {
  try {
    const url = `${BASE}/communes/${codeCommune}/dvf/?page=1&page_size=${limit}`
    const res = await timedFetch('dvf', 'getDvfByCommune', url, { next: { revalidate: 86400 } })
    if (!res.ok) return []
    const data = await res.json()
    const results: DvfRecord[] = data.results ?? []
    return results.filter(r => r.valeur_fonciere >= minValeur)
  } catch {
    return []
  }
}

// ── DVF perso — address-based matching ───────────────────────────────────────
//
// DVF doesn't carry the owner's SIREN — just the parcel + address. So we can
// never be SURE a mutation belongs to a prospect. What we CAN do : list the
// mutations on the address registered as the company's siège. Confidence
// remains a heuristic.
//
// Why this is useful : a CGP scanning a fiche wants to know "did anyone sell
// real estate at the dirigeant's business address in the last 5 years?" — even
// noisy, it's a starting point for a real conversation. We surface candidates
// with explicit confidence levels and never feed them into the patrimony
// score (too noisy).

export type DvfMatchConfidence = 'low' | 'medium' | 'high'

export interface DvfPersoCandidate {
  date_mutation: string
  nature_mutation: string
  valeur_fonciere: number
  type_local: string
  surface_reelle_bati?: number
  adresse_complete: string
  match_confidence: DvfMatchConfidence
  /** Human-readable explanation of how the match was scored. Surfaced in the
   *  fiche so the CGP understands the noise level. */
  match_reason: string
}

/** Normalize a fragment of address for fuzzy comparison. Strips diacritics,
 *  punctuation, common articles (de, du, la, le, les, l'), and collapses
 *  whitespace. Mirrors the heuristics in the slugify module but kept local
 *  to keep address-matching logic colocated. */
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

/**
 * Score a candidate match between the prospect's address and a DVF row.
 *  - high   : numero exact + voie includes target voie (or vice-versa)
 *  - medium : voie matches but numero differs or one side missing
 *  - low    : substring overlap on voie tokens (weak)
 *
 * Returns null when there's no reasonable overlap — caller drops the row.
 */
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

/** Returns true if the two address fragments share at least one significant
 *  word (length ≥ 4) — filters out matches on noise like "rue" or "place". */
function shareSignificantToken(a: string, b: string): boolean {
  const stop = new Set(['rue', 'avenue', 'av', 'bd', 'boulevard', 'place', 'allee', 'allée', 'chemin', 'route', 'impasse', 'cours', 'quai', 'square'])
  const tokensA = a.split(' ').filter((t) => t.length >= 4 && !stop.has(t))
  const tokensB = new Set(b.split(' ').filter((t) => t.length >= 4 && !stop.has(t)))
  return tokensA.some((t) => tokensB.has(t))
}

/**
 * Fetch DVF mutations for `codeCommune` and filter to those that plausibly
 * match the target address. Returns a confidence-scored list, sorted by
 * confidence (high → low) then date (recent → old).
 *
 * NOT used in patrimony scoring — too noisy. Pure display signal in the fiche.
 * Caller is responsible for hiding low-confidence rows behind a "voir plus"
 * if desired.
 */
export async function getDvfByAddress(params: {
  codeCommune: string
  adresseVoie: string
  adresseNumero?: string
  /** Cap fetched rows — DVF API pages are bounded at 500 typically. */
  pageSize?: number
  /** Confidence floor — defaults to 'low' to include weak matches. */
  minConfidence?: DvfMatchConfidence
}): Promise<DvfPersoCandidate[]> {
  if (!params.codeCommune || !params.adresseVoie) return []

  try {
    const url = `${BASE}/communes/${params.codeCommune}/dvf/?page=1&page_size=${params.pageSize ?? 500}`
    const res = await timedFetch('dvf', 'getDvfByAddress', url, { next: { revalidate: 86400 } })
    if (!res.ok) return []
    const data = await res.json()
    const records: DvfRecord[] = data.results ?? []

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
