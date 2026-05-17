import { timedFetch } from '@/lib/observability/logger'
import { tryConsumeQuota } from '@/lib/observability/api-quota'
import type { InboxEventType } from '@/lib/types'

/**
 * INPI RNE (Registre National des Entreprises) — daily diff of formality
 * events across all French enterprises (sociétés, artisanaux, agricoles,
 * libéraux). Activation path:
 *
 *   1. Compte sur data.inpi.fr + demande PAI validée (1-2 jours INPI)
 *   2. INPI fournit un token Bearer + base URL (varie selon le track):
 *        - API Formalité   → https://api.inpi.fr/formality
 *        - API RNE direct  → https://registre-national-entreprises.inpi.fr/api
 *   3. Poser les env vars suivantes sur Vercel (prod + preview + dev):
 *        INPI_API_TOKEN           (Bearer brut, sans le préfixe)
 *        INPI_API_BASE            (URL racine sans trailing slash)
 *        INPI_API_PATH            (path du diff endpoint, optional ;
 *                                  défaut `/companies/diff` — adapter selon
 *                                  ce que renvoie INPI dans la doc reçue)
 *   4. Optionnel: INPI_DAILY_LIMIT (cap quota, défaut 500 calls/jour)
 *   5. Smoke test:
 *        curl -H "Authorization: Bearer $CRON_SECRET" \
 *          https://charlie-prospection.vercel.app/api/cron/inpi-ingest
 *   6. Mode "probe" pour vérifier juste la connexion sans ingérer:
 *        curl -H "Authorization: Bearer $CRON_SECRET" \
 *          'https://charlie-prospection.vercel.app/api/cron/inpi-ingest?probe=1'
 *
 * Le schéma de réponse INPI varie selon le track. Le défaut accepte deux
 * formes ({ formalites: [...] } ou un array racine). Si INPI renvoie un
 * envelope différent (ex. { data: { items: [...] } }), passer un
 * `responseExtractor` custom à fetchInpiDailyDiff.
 */

/** Possible event categories on the INPI RNE diff. Mirrors what's in
 *  the formality JSON `typeEvenement` field. */
export type InpiEventCategory =
  | 'CREATION'
  | 'IMMATRICULATION'
  | 'MODIFICATION'
  | 'CESSATION'
  | 'RADIATION'
  | 'DISSOLUTION'
  | 'TRANSFERT_SIEGE'
  | 'MODIFICATION_DIRIGEANT'
  | 'MODIFICATION_CAPITAL'
  | 'MODIFICATION_BENEFICIAIRE'
  | 'MODIFICATION_BENEFICIAIRE_EFFECTIF'
  | 'PROCEDURE_COLLECTIVE'
  | 'DEPOT_COMPTES'
  | 'DEPOT_ACTES'
  | string // forward-compatible

export interface InpiFormality {
  /** Stable per-event identifier from INPI */
  id: string
  /** ISO date of the formality (decision date, not publication) */
  dateEvenement?: string
  siren?: string
  denomination?: string | null
  codeAPE?: string | null
  codePostal?: string | null
  typeEvenement?: InpiEventCategory
  /** Raw INPI payload, preserved for downstream enrichment */
  [key: string]: unknown
}

/**
 * Maps INPI's event taxonomy to our inbox taxonomy.
 *
 * Order matters: more specific patterns (e.g. MODIFICATION_CAPITAL) must
 * be checked before MODIFICATION generic. Same for IMMATRICULATION before
 * the generic MODIFICATION_*.
 *
 * The input is normalised: uppercased AND accents stripped so labels like
 * "Procédure collective" or "Création d'entreprise" match the same as
 * their accent-free versions.
 */
export function mapInpiTypeToEvent(t: string | undefined | null): InboxEventType {
  if (!t) return 'autre'
  // Normalise: strip diacritics + uppercase. NFD splits accented chars into
  // base + combining mark, then the regex drops the combining marks.
  const v = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  // Dépôt des comptes — checked first, high-volume noise category
  if (v.includes('DEPOT_COMPTES') || v.includes('DEPOT_DES_COMPTES')) return 'depot_comptes'
  if (v.includes('DEPOT_ACTES')) return 'modification'
  // Procédures collectives — most actionable signal
  if (v.includes('PROCEDURE') && v.includes('COLLECTIVE')) return 'procedure_collective'
  if (v === 'PROCEDURE_COLLECTIVE') return 'procedure_collective'
  // Capital modifications — high-signal patrimonial event
  if (v.includes('CAPITAL')) return 'modif_capital'
  // Bénéficiaires effectifs — also high-signal
  if (v.includes('BENEFICIAIRE') || v.includes('BENEFICIARY')) return 'modif_beneficiaire'
  // Creations
  if (v.includes('IMMATRICULATION') || v.startsWith('CREATION')) return 'creation'
  // Cessations / dissolutions / radiations
  if (v.includes('CESSATION') || v.includes('RADIATION') || v.includes('DISSOLUTION'))
    return 'radiation'
  // Generic modifications (transferts siège, modif dirigeant, etc.)
  if (v.includes('TRANSFERT') || v.includes('MODIFICATION') || v.includes('DIRIGEANT'))
    return 'modification'
  return 'autre'
}

/** Default extractor: accepts `{ formalites: [...] }` or a root array. */
function defaultExtractor(j: unknown): InpiFormality[] {
  if (j && typeof j === 'object' && Array.isArray((j as { formalites?: unknown }).formalites)) {
    return (j as { formalites: InpiFormality[] }).formalites
  }
  // Some INPI tracks return { data: [...] }
  if (j && typeof j === 'object' && Array.isArray((j as { data?: unknown }).data)) {
    return (j as { data: InpiFormality[] }).data
  }
  // Some return { items: [...] }
  if (j && typeof j === 'object' && Array.isArray((j as { items?: unknown }).items)) {
    return (j as { items: InpiFormality[] }).items
  }
  if (Array.isArray(j)) return j as InpiFormality[]
  return []
}

/**
 * Probe the INPI connection — calls the endpoint with limit=1 and returns
 * whether auth + URL + envelope work. Useful before the first full ingest.
 *
 * Returns:
 *   { ok: true, sample_count: N, sample_first: <first formality or null> }
 *   { ok: false, status: <http>, message: string }
 *
 * NB: still consumes one quota slot.
 */
export async function probeInpi(options: {
  baseUrl: string
  token: string
  path?: string
}): Promise<
  | { ok: true; status: number; sample_count: number; sample_first: InpiFormality | null }
  | { ok: false; status: number | null; message: string }
> {
  if (!(await tryConsumeQuota('inpi'))) {
    return { ok: false, status: null, message: 'INPI daily quota exhausted' }
  }
  const path = options.path ?? '/companies/diff'
  const url = `${options.baseUrl.replace(/\/$/, '')}${path}?limit=1`
  try {
    const res = await timedFetch('inpi', 'probeInpi', url, {
      headers: { Authorization: `Bearer ${options.token}`, Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        ok: false,
        status: res.status,
        message: text.slice(0, 200) || `HTTP ${res.status}`,
      }
    }
    const json = (await res.json()) as unknown
    const list = defaultExtractor(json)
    return {
      ok: true,
      status: res.status,
      sample_count: list.length,
      sample_first: list[0] ?? null,
    }
  } catch (err) {
    return {
      ok: false,
      status: null,
      message: err instanceof Error ? err.message : 'unknown error',
    }
  }
}

/**
 * Fetch the INPI RNE daily diff. Returns an empty array on auth/network
 * failure so the cron can degrade gracefully — errors surface via the
 * `timedFetch` logs.
 *
 * Quota: consumes one slot per page fetched (so pagination doesn't bypass
 * the daily cap). Returns partial results if quota runs out mid-pagination.
 */
export async function fetchInpiDailyDiff(options: {
  /** YYYY-MM-DD lower bound for the diff window */
  sinceDate: string
  /** Base URL — adapter selon le track INPI (voir doc en tête de fichier) */
  baseUrl: string
  /** Path of the diff endpoint on the base URL (default `/companies/diff`). */
  path?: string
  /** Bearer token issued by INPI */
  token: string
  /** Hard cap on total records fetched (paginates if necessary). Default 5000. */
  maxRecords?: number
  /** Page size hint sent to INPI. Default 1000. Actual size depends on INPI. */
  pageSize?: number
  /** Override the response envelope extractor if INPI returns a non-standard
   *  shape. Default tries `formalites`, `data`, `items`, or root array. */
  responseExtractor?: (json: unknown) => InpiFormality[]
}): Promise<InpiFormality[]> {
  const path = options.path ?? '/companies/diff'
  const maxRecords = options.maxRecords ?? 5000
  const pageSize = Math.min(options.pageSize ?? 1000, 1000)
  const extract = options.responseExtractor ?? defaultExtractor
  const out: InpiFormality[] = []
  let page = 1

  while (out.length < maxRecords) {
    // Quota check per page, not just at entry — pagination can't bypass the cap
    if (!(await tryConsumeQuota('inpi'))) break

    const url = `${options.baseUrl.replace(/\/$/, '')}${path}?from=${encodeURIComponent(
      options.sinceDate,
    )}&page=${page}&limit=${pageSize}`

    let res: Response
    try {
      res = await timedFetch('inpi', 'fetchInpiDailyDiff', url, {
        headers: { Authorization: `Bearer ${options.token}`, Accept: 'application/json' },
        cache: 'no-store',
      })
    } catch {
      break
    }
    if (!res.ok) break

    const json = (await res.json()) as unknown
    const items = extract(json)
    if (items.length === 0) break
    out.push(...items)

    if (items.length < pageSize) break
    page += 1
    // Safety: bail if INPI ignores `page` and returns the same first batch
    if (page > 50) break
  }

  return out.slice(0, maxRecords)
}
