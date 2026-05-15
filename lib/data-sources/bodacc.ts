import { timedFetch } from '@/lib/observability/logger'

const BASE = 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records'

export interface BodaccRecord {
  id: string
  dateparution: string
  typeavis_lib?: string
  familleavis_lib?: string
  commercant?: string
  ville?: string
  cp?: string
  registre?: string | string[]
  // Extended fields populated when fetching the firehose (recent ingestion)
  numerodepartement?: string
  departement_nom_officiel?: string
  region_code?: string
  region_nom_officiel?: string
  publicationavis?: string
  parution?: string
  listepersonnes?: unknown
}

export async function getBodaccBySiren(siren: string, limit = 10): Promise<BodaccRecord[]> {
  const where = `registre_rc_cs like "${siren}"`
  const url = `${BASE}?where=${encodeURIComponent(where)}&limit=${limit}&order_by=dateparution%20desc`
  try {
    const res = await timedFetch('bodacc', 'getBodaccBySiren', url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const data = await res.json()
    return data.results ?? []
  } catch {
    return []
  }
}

export async function getBodaccByName(nom: string, limit = 5): Promise<BodaccRecord[]> {
  const where = `commercant like "${nom.toUpperCase()}"`
  const url = `${BASE}?where=${encodeURIComponent(where)}&limit=${limit}&order_by=dateparution%20desc`
  try {
    const res = await timedFetch('bodacc', 'getBodaccByName', url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const data = await res.json()
    return data.results ?? []
  } catch {
    return []
  }
}

export function classifyBodaccEvent(record: BodaccRecord): 'cession' | 'creation' | 'radiation' | 'modification' | 'procedure_collective' | 'autre' {
  const lib = (record.familleavis_lib ?? record.typeavis_lib ?? '').toLowerCase()
  if (lib.includes('cession') || lib.includes('vente')) return 'cession'
  if (lib.includes('création') || lib.includes('immatriculation')) return 'creation'
  if (lib.includes('radiation') || lib.includes('dissolution')) return 'radiation'
  if (lib.includes('redressement') || lib.includes('liquidation') || lib.includes('sauvegarde')) return 'procedure_collective'
  if (lib.includes('modification')) return 'modification'
  return 'autre'
}

// ── Recent ingestion firehose (used by /api/cron/bodacc-ingest) ────────────

/**
 * Extract a SIREN (9 digits) from a BODACC `registre` field, which can be:
 *   - a string like "552 100 554 R.C.S Paris"
 *   - an array containing the same
 */
export function extractSirenFromRegistre(registre: string | string[] | undefined): string | null {
  if (!registre) return null
  const raw = Array.isArray(registre) ? registre.join(' ') : registre
  const match = raw.replace(/\s+/g, '').match(/\d{9}/)
  return match ? match[0] : null
}

/** Extract a 2-digit departement code from a CP, falling back to a 2A/2B Corsican prefix. */
export function extractDepartementFromCp(cp: string | undefined): string | null {
  if (!cp) return null
  const cleaned = cp.replace(/\s+/g, '')
  if (/^20\d{3}$/.test(cleaned)) {
    // Corsica: 200xx–201xx → 2A, 202xx–206xx → 2B (rough heuristic)
    const n = parseInt(cleaned.slice(0, 3), 10)
    return n <= 201 ? '2A' : '2B'
  }
  const m = cleaned.match(/^(\d{2,3})/)
  if (!m) return null
  // Overseas (97x) keeps 3 digits, mainland keeps 2
  return m[1].startsWith('97') ? m[1] : m[1].slice(0, 2)
}

/**
 * Fetch BODACC announcements with `dateparution` >= the given ISO date.
 * Pages through the BODACC API (max 100 per page, hard cap 1000 by default).
 */
export async function fetchRecentBodaccAnnouncements(options: {
  /** Inclusive lower bound for dateparution, formatted YYYY-MM-DD */
  sinceDate: string
  /** Max total records to pull (safety cap). Default 1000. */
  maxRecords?: number
  /** Page size, max 100 per BODACC API. */
  pageSize?: number
}): Promise<BodaccRecord[]> {
  const maxRecords = options.maxRecords ?? 1000
  const pageSize = Math.min(options.pageSize ?? 100, 100)
  const out: BodaccRecord[] = []
  let offset = 0

  while (out.length < maxRecords) {
    const where = `dateparution >= date'${options.sinceDate}'`
    const url = `${BASE}?where=${encodeURIComponent(where)}&limit=${pageSize}&offset=${offset}&order_by=dateparution%20desc`
    let res: Response
    try {
      res = await fetch(url, { cache: 'no-store' })
    } catch {
      break
    }
    if (!res.ok) break
    const data = (await res.json()) as { results?: BodaccRecord[]; total_count?: number }
    const page = data.results ?? []
    if (page.length === 0) break
    out.push(...page)
    if (page.length < pageSize) break
    offset += pageSize
  }

  return out.slice(0, maxRecords)
}
