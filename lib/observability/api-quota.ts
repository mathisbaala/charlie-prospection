import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * Defensive daily-call cap on metered external APIs.
 *
 * Currently scopes only Pappers, but the table is keyed by `source` so other
 * paid endpoints (e.g. INPI premium) can plug in the same way.
 *
 * Usage in a fetch wrapper:
 *
 *   const allowed = await tryConsumeQuota('pappers')
 *   if (!allowed) {
 *     // Gracefully degrade — return empty results, fall through to another source,
 *     // or surface a "quota épuisée" error to the route.
 *     return null
 *   }
 *
 * Configuration is via env vars so we don't need a migration to bump:
 *   - PAPPERS_DAILY_LIMIT    (default 500)
 *   - SIRENE_DAILY_LIMIT     (default 500)
 *   - INPI_DAILY_LIMIT       (default 500)
 *   - QUOTA_DISABLED=1       (no-op the cap — useful in tests or emergencies)
 */
export type QuotaSource = 'pappers' | 'sirene' | 'inpi' | 'bodacc'

const DEFAULT_LIMITS: Record<QuotaSource, number> = {
  pappers: 500,
  sirene: 1000,
  inpi: 500,
  bodacc: 5000,
}

function getCap(source: QuotaSource): number {
  const envKey = `${source.toUpperCase()}_DAILY_LIMIT`
  const raw = process.env[envKey]
  if (raw) {
    const n = parseInt(raw, 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  return DEFAULT_LIMITS[source]
}

function isDisabled(): boolean {
  return process.env.QUOTA_DISABLED === '1' || process.env.NODE_ENV === 'test'
}

// The Supabase typed client requires generated Database types to type RPC
// arg/return shapes. We don't generate those here, so we accept the
// untyped surface and cast rpc() calls at the use site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

let _client: AnyClient | null = null
function getClient(): AnyClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  _client = createServiceClient(url, key, { auth: { persistSession: false } })
  return _client
}

/**
 * Atomically consume one quota slot for the given source. Returns true if
 * the call may proceed, false if the daily cap is reached.
 *
 * Fail-open: if the quota check itself errors (DB down, missing env, etc.),
 * we let the call through to avoid blocking legitimate traffic during
 * infra hiccups. Errors are logged so anomalies still surface.
 */
export async function tryConsumeQuota(source: QuotaSource): Promise<boolean> {
  if (isDisabled()) return true

  const client = getClient()
  if (!client) return true // No DB → fail-open

  const cap = getCap(source)
  try {
    const { data, error } = await client.rpc('increment_api_quota', {
      p_source: source,
      p_cap: cap,
    })
    if (error) {
      console.error(`[api-quota] RPC error for ${source}:`, error.message)
      return true
    }
    const count = typeof data === 'number' ? data : -1
    if (count === -1) {
      console.warn(`[api-quota] DAILY CAP HIT for ${source} (cap=${cap}) — denying call`)
      return false
    }
    return true
  } catch (e) {
    console.error(`[api-quota] unexpected error for ${source}:`, e)
    return true // Fail-open
  }
}

/**
 * Read-only quota inspection (no increment). Used by observability / admin
 * dashboards. Returns { count, cap, remaining }.
 */
export async function getQuotaStatus(
  source: QuotaSource,
): Promise<{ count: number; cap: number; remaining: number } | null> {
  const client = getClient()
  if (!client) return null
  const cap = getCap(source)
  try {
    const { data } = await client.rpc('get_api_quota', { p_source: source })
    const count = typeof data === 'number' ? data : 0
    return { count, cap, remaining: Math.max(0, cap - count) }
  } catch {
    return null
  }
}
