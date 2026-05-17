import { timedFetch } from '@/lib/observability/logger'
import { tryConsumeQuota } from '@/lib/observability/api-quota'

/**
 * INSEE Sirene API v3.11 — firehose of French entity creations.
 *
 * Covers SIREN/SIRET registrations across the entire French economy, including
 * the BNC / micro / libéraux populations that BODACC (RCS-only) does not see.
 *
 * Auth: simple `X-INSEE-Api-Key-Integration` header. The key is issued on
 * https://portail-api.insee.fr after subscribing the application to the
 * Sirene product. No OAuth2 round-trip required (since the 2024 portal
 * migration, the static API key replaces the old Bearer token flow).
 *
 * Free tier limits: 30 req/min, ~500 calls/day. We page in batches of 1000
 * with offset-based pagination (`debut`/`nombre`), which stays well under
 * the call budget for daily firehose windows.
 *
 * Non-diffusable fields: INSEE redacts certain fields for privacy with the
 * literal string `[ND]`. The helpers below normalise that to `null` so
 * downstream code never sees the placeholder.
 */

const BASE = 'https://api.insee.fr/api-sirene/3.11/siret'

/** INSEE redacts non-diffusable fields with `[ND]`. Treat as null. */
function denull(v: string | null | undefined): string | null {
  if (!v) return null
  const trimmed = v.trim()
  if (trimmed === '' || trimmed === '[ND]') return null
  return trimmed
}

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

/** Best-effort name resolution: companies use denomination, individuals concat prenom+nom.
 *  Treats `[ND]` redactions as missing data. */
export function resolveSireneName(et: SireneEtablissement): string | null {
  const ul = et.uniteLegale
  const denom = denull(ul.denominationUniteLegale)
  if (denom) return denom
  const nom = denull(ul.nomUniteLegale) ?? ''
  const prenom = denull(ul.prenom1UniteLegale) ?? ''
  const composed = `${prenom} ${nom}`.trim()
  return composed.length > 0 ? composed : null
}

/** 2-digit département (or 2A/2B Corsica, or 97x overseas) from a CP. Treats `[ND]` as missing. */
export function extractDepartementFromCpFR(cp: string | undefined | null): string | null {
  const cleaned = denull(cp ?? null)
  if (!cleaned) return null
  const c = cleaned.replace(/\s+/g, '')
  if (/^20\d{3}$/.test(c)) {
    const n = parseInt(c.slice(0, 3), 10)
    return n <= 201 ? '2A' : '2B'
  }
  const m = c.match(/^(\d{2,3})/)
  if (!m) return null
  return m[1].startsWith('97') ? m[1] : m[1].slice(0, 2)
}

/** Normalise Sirene NAF format (e.g. "86.21Z" → "8621Z"). Treats `[ND]` as missing. */
export function normaliseSireneNaf(naf: string | null | undefined): string | null {
  const cleaned = denull(naf ?? null)
  if (!cleaned) return null
  return cleaned.replace(/\./g, '').toUpperCase()
}

export interface SireneUniteLegale {
  siren: string
  denominationUniteLegale?: string | null
  nomUniteLegale?: string | null
  prenom1UniteLegale?: string | null
  activitePrincipaleUniteLegale?: string | null
  categorieJuridiqueUniteLegale?: string | null
  trancheEffectifsUniteLegale?: string | null
  /** 'A' = actif, 'C' = cessé */
  etatAdministratifUniteLegale?: string | null
  dateCreationUniteLegale?: string | null
}

interface SireneUniteLegaleResponse {
  header?: { statut: number; message: string }
  uniteLegale?: SireneUniteLegale
}

/**
 * Fetch a single unité légale by SIREN.
 *
 * Used in enrichProspect() for persons with a known SIREN — gives more
 * reliable tranche effectifs and entity status than Pappers alone.
 *
 * Returns null on error, quota exhaustion, or entity not found.
 */
export async function fetchSireneBySiren(
  siren: string,
  apiKey: string,
): Promise<SireneUniteLegale | null> {
  if (!siren || !apiKey) return null
  if (!(await tryConsumeQuota('sirene'))) return null

  const url = `https://api.insee.fr/api-sirene/3.11/siren/${encodeURIComponent(siren)}`
  try {
    const res = await timedFetch('sirene', 'fetchSireneBySiren', url, {
      headers: {
        'X-INSEE-Api-Key-Integration': apiKey,
        Accept: 'application/json',
      },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as SireneUniteLegaleResponse
    const ul = data.uniteLegale
    if (!ul) return null
    return {
      siren,
      denominationUniteLegale: denull(ul.denominationUniteLegale),
      nomUniteLegale: denull(ul.nomUniteLegale),
      prenom1UniteLegale: denull(ul.prenom1UniteLegale),
      activitePrincipaleUniteLegale: denull(ul.activitePrincipaleUniteLegale),
      categorieJuridiqueUniteLegale: denull(ul.categorieJuridiqueUniteLegale),
      trancheEffectifsUniteLegale: denull(ul.trancheEffectifsUniteLegale),
      etatAdministratifUniteLegale: denull(ul.etatAdministratifUniteLegale),
      dateCreationUniteLegale: denull(ul.dateCreationUniteLegale),
    }
  } catch {
    return null
  }
}

/**
 * Fetch Sirene établissements created within [sinceDate, untilDate] (inclusive).
 * Uses offset-based pagination (`debut`/`nombre`) which is sufficient for our
 * daily window (~1k-2k siege creations per day).
 */
export async function fetchSireneCreations(options: {
  /** YYYY-MM-DD lower bound (inclusive) on dateCreationEtablissement */
  sinceDate: string
  /** YYYY-MM-DD upper bound (inclusive) */
  untilDate: string
  /** API key issued by https://portail-api.insee.fr (X-INSEE-Api-Key-Integration) */
  apiKey: string
  /** Default 2000, hard cap 5000 to bound cost */
  maxRecords?: number
  /** Page size, max 1000 */
  pageSize?: number
}): Promise<SireneEtablissement[]> {
  const max = Math.min(options.maxRecords ?? 2000, 5000)
  const pageSize = Math.min(options.pageSize ?? 1000, 1000)
  const out: SireneEtablissement[] = []

  // Only siege establishments to avoid duplicates (one entity = N etablissements).
  const query = `dateCreationEtablissement:[${options.sinceDate} TO ${options.untilDate}] AND etablissementSiege:true`

  let debut = 0
  while (out.length < max) {
    // Daily quota — each page is one Sirene API call. Stop ingesting (return
    // partial results) when cap is reached rather than hammering the API.
    if (!(await tryConsumeQuota('sirene'))) break

    const url = `${BASE}?q=${encodeURIComponent(query)}&nombre=${pageSize}&debut=${debut}`
    let res: Response
    try {
      res = await timedFetch('sirene', 'fetchSireneCreations', url, {
        headers: {
          'X-INSEE-Api-Key-Integration': options.apiKey,
          Accept: 'application/json',
        },
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

    if (page.length < pageSize) break
    debut += pageSize
  }

  return out.slice(0, max)
}
