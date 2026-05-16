import { type VercelConfig } from '@vercel/config/v1'

/**
 * Charlie Prospection — Vercel project configuration.
 *
 * Daily firehose pipeline (all times UTC):
 *   - 05:30  /api/cron/sirene-ingest    INSEE Sirene v3.11 firehose. Captures
 *                                       SIREN/SIRET creations across the ENTIRE
 *                                       French economy (incl. BNC / libéraux
 *                                       absent from BODACC). Skipped silently
 *                                       if INSEE_SIRENE_TOKEN is unset.
 *   - 05:45  /api/cron/inpi-ingest      INPI RNE daily diff: cessations,
 *                                       modifications de capital, modifs BE.
 *                                       Skipped silently if INPI credentials
 *                                       are unset.
 *   - 06:00  /api/cron/bodacc-ingest    BODACC annonces-commerciales of the
 *                                       last 24h.
 *   - 06:30  /api/cron/match-icps       Walks every active ICP and flags inbox
 *                                       signals that intersect the ICP's NAF
 *                                       codes + departements. Runs 30 minutes
 *                                       after the last ingest to give all
 *                                       three feeds room to land.
 *
 * Refresh per-prospect enrichment is PAUSÉ pour l'instant — phase MVP, pas
 * de commercialisation, pas besoin de la veille quotidienne. Quand on
 * réactive (commercialisation), cadence cible : 2× par mois (1er et 15)
 * avec REFRESH_AFTER_DAYS=14 + BATCH_SIZE=30 dans la route — voir
 * app/api/cron/refresh-enrichment/route.ts.
 *
 *   //  { path: '/api/cron/refresh-enrichment', schedule: '0 4 1,15 * *' },
 *
 * All cron routes require the `CRON_SECRET` env var; Vercel sends
 * `Authorization: Bearer $CRON_SECRET` on scheduled invocations automatically.
 * La route reste callable manuellement même hors planning (curl avec auth)
 * pour tests / refresh ad-hoc — c'est juste l'auto-trigger qui est désactivé.
 *
 * Vercel Hobby supports up to 100 cron jobs per project (raised Jan 2026),
 * limited to a once-per-day schedule per job.
 */
export const config: VercelConfig = {
  framework: 'nextjs',
  crons: [
    { path: '/api/cron/sirene-ingest', schedule: '30 5 * * *' },
    { path: '/api/cron/inpi-ingest', schedule: '45 5 * * *' },
    { path: '/api/cron/bodacc-ingest', schedule: '0 6 * * *' },
    { path: '/api/cron/match-icps', schedule: '30 6 * * *' },
    // refresh-enrichment cron : PAUSED — voir doc en haut.
    { path: '/api/cron/refresh-rpps', schedule: '0 4 1 * *' },  // 1st of each month at 04:00 UTC
    { path: '/api/cron/refresh-persons-cache', schedule: '0 3 * * 1' },  // Mondays at 03:00 UTC
  ],
}

export default config
