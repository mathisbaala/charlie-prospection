import { type VercelConfig } from '@vercel/config/v1'

/**
 * Charlie Prospection — Vercel project configuration.
 *
 * Crons:
 *   - 06:00 UTC daily  → /api/cron/bodacc-ingest
 *       Pulls the last 24h of BODACC announcements into the global signals
 *       inbox (prospection_signals_inbox).
 *   - 06:15 UTC daily  → /api/cron/match-icps
 *       Walks every active ICP and flags inbox signals that intersect the
 *       ICP's NAF codes + departements. Runs 15 minutes after ingestion so
 *       the new rows are visible.
 *
 * Both cron routes require the `CRON_SECRET` env var. Vercel automatically
 * sends `Authorization: Bearer $CRON_SECRET` on scheduled invocations when
 * the env var is configured on the project.
 */
export const config: VercelConfig = {
  framework: 'nextjs',
  crons: [
    { path: '/api/cron/bodacc-ingest', schedule: '0 6 * * *' },
    { path: '/api/cron/match-icps', schedule: '15 6 * * *' },
  ],
}

export default config
