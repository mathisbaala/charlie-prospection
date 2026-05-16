// Helper shared between /api/suivi/add (RLS client) and the refresh-enrichment
// cron (service client). Both pipelines persist Premium-derived signals into
// `prospection_signals` and need the same idempotent upsert + last_signal_at
// refresh semantics.
//
// Keeping this out of the route file means the mining logic stays unit-testable
// without dragging Next.js/Supabase server context into the tests.

import type { SupabaseClient } from '@supabase/supabase-js'
import { minePremiumSignals } from './premium-signal-miner'
import type { PappersPremiumData } from '@/lib/types'

export interface PersistResult {
  /** Number of brand-new signals inserted (excludes ignored duplicates). */
  inserted: number
  /** Newest detected_at across mined signals — used to bump last_signal_at. */
  max_detected_at: string | null
}

/**
 * Mine Premium signals from `premium`, upsert them into `prospection_signals`
 * with `ON CONFLICT DO NOTHING`, and refresh the prospect's `last_signal_at`
 * iff the newest mined signal is more recent than what's already on the row.
 *
 * Never throws — returns `{ inserted: 0, max_detected_at: null }` on any
 * failure and logs the underlying error. Premium mining is enrichment, not
 * a hard requirement of the enrichment flow.
 */
export async function persistPremiumSignals(
  supabase: SupabaseClient,
  prospectId: string,
  orgId: string,
  premium: PappersPremiumData | undefined,
): Promise<PersistResult> {
  if (!premium) return { inserted: 0, max_detected_at: null }

  try {
    const mined = minePremiumSignals(premium)
    if (mined.length === 0) return { inserted: 0, max_detected_at: null }

    const rows = mined.map((s) => ({
      prospect_id: prospectId,
      org_id: orgId,
      type: s.type,
      source: s.source,
      data: s.data,
      detected_at: s.detected_at,
    }))

    const { error, count } = await supabase
      .from('prospection_signals')
      .upsert(rows, {
        onConflict: 'prospect_id,source,type,detected_at',
        ignoreDuplicates: true,
        count: 'exact',
      })

    if (error) {
      console.error('[premium-signals] upsert failed', error.message)
      return { inserted: 0, max_detected_at: null }
    }

    const maxDetectedAt = mined.reduce(
      (acc, s) => (s.detected_at > acc ? s.detected_at : acc),
      '',
    )

    if (maxDetectedAt) {
      await supabase
        .from('prospection_prospects')
        .update({ last_signal_at: maxDetectedAt })
        .eq('id', prospectId)
        .or(`last_signal_at.is.null,last_signal_at.lt.${maxDetectedAt}`)
    }

    return { inserted: count ?? 0, max_detected_at: maxDetectedAt || null }
  } catch (e) {
    console.error('[premium-signals] miner threw', e)
    return { inserted: 0, max_detected_at: null }
  }
}
