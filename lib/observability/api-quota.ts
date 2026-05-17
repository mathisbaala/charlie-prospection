import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * Defensive call-cap on metered external APIs.
 *
 * Scope per source — IMPORTANT car les abonnements externes ne sont pas
 * tous quotidiens :
 *
 *   - Pappers : 500 crédits par MOIS (plan payant du fondateur, 2026-05).
 *     Sans cap mensuel le crédit serait épuisé en 1-2 jours.
 *   - Sirene  : free tier ~ 30 req/min, pas de limite mensuelle stricte
 *     → cap quotidien défensif.
 *   - INPI    : plan PAI variable, on cap par jour par défaut.
 *   - BODACC  : open data gratuit, pas de limite officielle, cap quotidien
 *     défensif uniquement pour éviter un runaway loop.
 *
 * La table `prospection_api_quota(source, date, count)` est commune aux deux
 * scopes : pour le scope mensuel, on stocke avec `date = premier-du-mois`.
 * La RPC `increment_api_quota(p_source, p_cap, p_today)` accepte une date
 * arbitraire — on lui passe la bonne période-clé selon le scope.
 *
 * Usage en fetch wrapper :
 *
 *   const allowed = await tryConsumeQuota('pappers')
 *   if (!allowed) return null  // dégradation gracieuse
 *
 * Configuration env vars (le préfixe précise le scope) :
 *   - PAPPERS_MONTHLY_LIMIT  (défaut 500 — match l'abonnement)
 *   - PAPPERS_DAILY_LIMIT    (legacy, ignoré si MONTHLY est posé)
 *   - SIRENE_DAILY_LIMIT     (défaut 1000)
 *   - INPI_DAILY_LIMIT       (défaut 500)
 *   - BODACC_DAILY_LIMIT     (défaut 5000)
 *   - QUOTA_DISABLED=1       (no-op le cap — debug / urgences)
 */
export type QuotaSource = 'pappers' | 'sirene' | 'inpi' | 'bodacc'

type Scope = 'daily' | 'monthly'

/** Périmètre de comptage par source. Pappers = mensuel à cause de l'abo
 *  facturé au mois. Les sources gratuites ou rate-limitées restent
 *  quotidiennes. */
const SCOPE: Record<QuotaSource, Scope> = {
  pappers: 'monthly',
  sirene: 'daily',
  inpi: 'daily',
  bodacc: 'daily',
}

/** Plafonds par défaut. Override via env var. */
const DEFAULT_CAPS: Record<QuotaSource, number> = {
  pappers: 500, // crédits/mois du plan payant
  sirene: 1000, // par jour, défensif
  inpi: 500, // par jour, défensif
  bodacc: 5000, // par jour, défensif
}

/**
 * Resolve cap from env (preferring scope-matching env var) or default.
 * Pour Pappers, vérifie d'abord `PAPPERS_MONTHLY_LIMIT` (canonical), puis
 * fallback sur `PAPPERS_DAILY_LIMIT` (legacy/migration grace) avant le
 * défaut. Les autres sources lisent uniquement leur `*_DAILY_LIMIT`.
 */
function getCap(source: QuotaSource): number {
  const scope = SCOPE[source]
  const envKeys =
    scope === 'monthly'
      ? [`${source.toUpperCase()}_MONTHLY_LIMIT`, `${source.toUpperCase()}_DAILY_LIMIT`]
      : [`${source.toUpperCase()}_DAILY_LIMIT`]

  for (const key of envKeys) {
    const raw = process.env[key]
    if (raw) {
      const n = parseInt(raw, 10)
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return DEFAULT_CAPS[source]
}

/** Returns the period-key (date string YYYY-MM-DD) to pass to the RPC.
 *  Daily = today. Monthly = first day of current month. */
function periodKey(source: QuotaSource): string {
  const now = new Date()
  if (SCOPE[source] === 'monthly') {
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    return `${yyyy}-${mm}-01`
  }
  return now.toISOString().slice(0, 10)
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
 * the call may proceed, false if the cap (daily OR monthly selon le scope)
 * est atteint.
 *
 * Fail-open : si la vérif elle-même casse (DB down, env manquant), on laisse
 * passer pour ne pas bloquer le user pendant un hiccup infra. Les erreurs
 * sont loggées pour visibilité.
 */
export async function tryConsumeQuota(source: QuotaSource): Promise<boolean> {
  if (isDisabled()) return true

  const client = getClient()
  if (!client) return true

  const cap = getCap(source)
  const period = periodKey(source)
  try {
    const { data, error } = await client.rpc('increment_api_quota', {
      p_source: source,
      p_cap: cap,
      p_today: period,
    })
    if (error) {
      console.error(`[api-quota] RPC error for ${source}:`, error.message)
      return true
    }
    const count = typeof data === 'number' ? data : -1
    if (count === -1) {
      const scopeLabel = SCOPE[source] === 'monthly' ? 'MONTHLY' : 'DAILY'
      console.warn(
        `[api-quota] ${scopeLabel} CAP HIT for ${source} (cap=${cap}, period=${period}) — denying call`,
      )
      return false
    }
    return true
  } catch (e) {
    console.error(`[api-quota] unexpected error for ${source}:`, e)
    return true
  }
}

export interface QuotaStatus {
  source: QuotaSource
  scope: Scope
  period: string
  count: number
  cap: number
  remaining: number
}

/**
 * Read-only quota inspection (no increment). Returns scope + period + count
 * so the caller can display "X / 500 crédits ce mois" ou "X / 1000 ce jour".
 */
export async function getQuotaStatus(source: QuotaSource): Promise<QuotaStatus | null> {
  const client = getClient()
  if (!client) return null
  const cap = getCap(source)
  const period = periodKey(source)
  try {
    const { data } = await client.rpc('get_api_quota', {
      p_source: source,
      p_today: period,
    })
    const count = typeof data === 'number' ? data : 0
    return {
      source,
      scope: SCOPE[source],
      period,
      count,
      cap,
      remaining: Math.max(0, cap - count),
    }
  } catch {
    return null
  }
}
