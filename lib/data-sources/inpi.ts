import { timedFetch } from '@/lib/observability/logger'
import type { InboxEventType } from '@/lib/types'

/**
 * INPI RNE (Registre National des Entreprises) — daily diff of formality events
 * across all French enterprises (sociétés, artisanaux, agricoles, libéraux).
 *
 * Auth: token issued by INPI after manual provisioning (1-2 days).
 * Endpoint: configured via INPI_API_BASE env var because INPI offers multiple
 * tracks (Open Data RNE, API Formalité, etc.) and the URL depends on which
 * subscription was granted.
 *
 * This module is intentionally generic: it reads a daily diff JSON from the
 * configured endpoint and maps each event to our SignalsInboxInsert. When the
 * INPI access type is finalised, only the URL builder + the field extractor
 * need adapting — the schema and matching pipeline stay the same.
 */

/** Possible event categories on the INPI RNE diff. Mirrors what's in
 *  the formality JSON `typeEvenement` field. */
export type InpiEventCategory =
  | 'CREATION'
  | 'MODIFICATION'
  | 'CESSATION'
  | 'TRANSFERT_SIEGE'
  | 'MODIFICATION_CAPITAL'
  | 'MODIFICATION_BENEFICIAIRE'
  | 'PROCEDURE_COLLECTIVE'
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

/** Maps INPI's event taxonomy to our inbox taxonomy. */
export function mapInpiTypeToEvent(t: string | undefined | null): InboxEventType {
  if (!t) return 'autre'
  const v = t.toUpperCase()
  if (v.includes('CREATION') || v.includes('IMMATRICULATION')) return 'creation'
  if (v.includes('CESSATION') || v.includes('RADIATION')) return 'radiation'
  if (v.includes('PROCEDURE')) return 'procedure_collective'
  if (v.includes('CAPITAL')) return 'modif_capital'
  if (v.includes('BENEFICIAIRE') || v.includes('BENEFICIARY')) return 'modif_beneficiaire'
  if (v.includes('TRANSFERT') || v.includes('MODIFICATION')) return 'modification'
  return 'autre'
}

/**
 * Fetch the INPI RNE daily diff. Returns an empty array on auth failure so
 * the cron can degrade gracefully — the underlying error surfaces in logs
 * via `timedFetch`.
 *
 * NOTE: the actual response shape depends on the INPI subscription tier. The
 * default extractor below assumes a top-level `formalites` array. If your
 * INPI access exposes a different envelope, override via `responseExtractor`.
 */
export async function fetchInpiDailyDiff(options: {
  /** YYYY-MM-DD lower bound for the diff window */
  sinceDate: string
  /** Base URL — typically `https://registre-national-entreprises.inpi.fr/api` */
  baseUrl: string
  /** Bearer token issued by INPI */
  token: string
  /** Override if the response envelope differs from { formalites: [...] } */
  responseExtractor?: (json: unknown) => InpiFormality[]
}): Promise<InpiFormality[]> {
  const url = `${options.baseUrl.replace(/\/$/, '')}/companies/diff?from=${encodeURIComponent(options.sinceDate)}`
  let res: Response
  try {
    res = await timedFetch('inpi', 'fetchInpiDailyDiff', url, {
      headers: { Authorization: `Bearer ${options.token}`, Accept: 'application/json' },
      cache: 'no-store',
    })
  } catch {
    return []
  }
  if (!res.ok) return []

  const json = (await res.json()) as unknown
  const extract =
    options.responseExtractor ??
    ((j: unknown) => {
      if (j && typeof j === 'object' && Array.isArray((j as { formalites?: unknown }).formalites)) {
        return (j as { formalites: InpiFormality[] }).formalites
      }
      if (Array.isArray(j)) return j as InpiFormality[]
      return []
    })

  return extract(json)
}
