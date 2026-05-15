import { timedFetch } from '@/lib/observability/logger'

/**
 * INSEE Sirene API v3.11 — firehose of French entity creations.
 *
 * Covers SIREN/SIRET registrations across the entire French economy, including
 * the BNC / micro / libéraux populations that BODACC (RCS-only) does not see.
 *
 * Auth: Bearer token from https://portail-api.insee.fr (free, ~5 min signup).
 * Rate limits: 30 req/min for the free tier. We page in batches of 1000.
 */

const BASE = 'https://api.insee.fr/api-sirene/3.11/siret'

export interface SireneEtablissement {
  siret: string
  uniteLegale: {
    denominationUniteLegale?: string | null
    nomUniteLegale?: string | null
    prenom1UniteLegale?: string | null
    activitePrincipaleUniteLegale?: string | null
    dateCreationUniteLegale?: string | null
    categorieJuridiqueUniteLegale?: string | null
  }
  adresseEtablissement?: {
    codePostalEtablissement?: string | null
    libelleCommuneEtablissement?: string | null
    codeCommuneEtablissement?: string | null
  }
  dateCreationEtablissement?: string | null
  etablissementSiege?: boolean
  periodesEtablissement?: Array<{
    dateFin?: string | null
    etatAdministratifEtablissement?: string | null
  }>
}

interface SireneResponse {
  header: {
    statut: number
    message: string
    total?: number
    curseur?: string
    curseurSuivant?: string | null
  }
  etablissements?: SireneEtablissement[]
}

/** Best-effort name resolution: companies use denomination, individuals concat prenom+nom. */
export function resolveSireneName(et: SireneEtablissement): string | null {
  const ul = et.uniteLegale
  if (ul.denominationUniteLegale) return ul.denominationUniteLegale
  const nom = ul.nomUniteLegale ?? ''
  const prenom = ul.prenom1UniteLegale ?? ''
  const composed = `${prenom} ${nom}`.trim()
  return composed.length > 0 ? composed : null
}

/** 2-digit département (or 2A/2B Corsica, or 97x overseas) from a CP. */
export function extractDepartementFromCpFR(cp: string | undefined | null): string | null {
  if (!cp) return null
  const cleaned = cp.replace(/\s+/g, '')
  if (/^20\d{3}$/.test(cleaned)) {
    const n = parseInt(cleaned.slice(0, 3), 10)
    return n <= 201 ? '2A' : '2B'
  }
  const m = cleaned.match(/^(\d{2,3})/)
  if (!m) return null
  return m[1].startsWith('97') ? m[1] : m[1].slice(0, 2)
}

/** Normalise Sirene NAF format (e.g. "86.21Z" → "8621Z"). */
export function normaliseSireneNaf(naf: string | null | undefined): string | null {
  if (!naf) return null
  return naf.replace(/\./g, '').toUpperCase()
}

/**
 * Fetch Sirene établissements created within [sinceDate, untilDate] (inclusive).
 * Pages via curseur (recommended over offset for stable pagination on a moving
 * dataset). Stops at maxRecords for safety.
 */
export async function fetchSireneCreations(options: {
  /** YYYY-MM-DD lower bound (inclusive) on dateCreationEtablissement */
  sinceDate: string
  /** YYYY-MM-DD upper bound (inclusive) */
  untilDate: string
  token: string
  /** Default 1000, hard cap 5000 to bound cost */
  maxRecords?: number
  /** Page size, max 1000 */
  pageSize?: number
}): Promise<SireneEtablissement[]> {
  const max = Math.min(options.maxRecords ?? 1000, 5000)
  const pageSize = Math.min(options.pageSize ?? 1000, 1000)
  const out: SireneEtablissement[] = []

  // Only siege establishments to avoid duplicates (one entity = N etablissements).
  // dateCreationEtablissement range filter is the firehose key.
  const query = `dateCreationEtablissement:[${options.sinceDate} TO ${options.untilDate}] AND etablissementSiege:true`

  let curseur: string = '*'
  while (out.length < max) {
    const url = `${BASE}?q=${encodeURIComponent(query)}&nombre=${pageSize}&curseur=${encodeURIComponent(curseur)}`
    let res: Response
    try {
      res = await timedFetch('sirene', 'fetchSireneCreations', url, {
        headers: { Authorization: `Bearer ${options.token}`, Accept: 'application/json' },
        cache: 'no-store',
      })
    } catch {
      break
    }
    if (!res.ok) break

    const data = (await res.json()) as SireneResponse
    const page = data.etablissements ?? []
    if (page.length === 0) break
    out.push(...page)

    const next = data.header?.curseurSuivant
    if (!next || next === curseur) break
    curseur = next
    if (page.length < pageSize) break
  }

  return out.slice(0, max)
}
