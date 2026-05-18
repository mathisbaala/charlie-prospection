import { type VercelConfig } from '@vercel/config/v1'

/**
 * Charlie Prospection — Vercel project configuration.
 *
 * Pipeline en 3 étapes (enrichissement progressif) :
 *
 *   Étape 1 — Collecte : ingest scripts (RPPS, AE, Pappers bulk…)
 *             → prospection_persons avec enrichment_level='raw'
 *
 *   Étape 2 — Standard (ce cron, 08:00 UTC, quotidien) :
 *             Personnes 'raw' depuis 24h → Pappers standard + BODACC léger
 *             + score règles métier. Pas de Claude. Refresh 2x/an.
 *             → enrichment_level='standard'
 *
 *   Étape 3 — Deep (déclenché par /api/suivi/add + refresh-enrichment) :
 *             Pappers premium + 10 sources + Claude Sonnet scoring.
 *             Prospects en suivi uniquement. Refresh mensuel.
 *             → enrichment_level='deep'
 *
 * Daily firehose pipeline (all times UTC):
 *   - 05:30  /api/cron/sirene-ingest    INSEE Sirene v3.11 firehose.
 *   - 05:45  /api/cron/inpi-ingest      INPI RNE daily diff.
 *   - 06:00  /api/cron/bodacc-ingest    BODACC annonces-commerciales 24h.
 *   - 06:30  /api/cron/match-icps       Signaux → ICPs matching.
 *   - 08:00  /api/cron/enrich-persons-standard  Étape 2 — enrichissement
 *                                       standard (Pappers + BODACC léger,
 *                                       sans Claude). Batch 50/run.
 *   - 09:00  /api/cron/enrich-persons   Étape 3 — deep enrichment Claude
 *                                       sur les prospects en suivi 'raw'.
 *
 * Refresh per-prospect enrichment : 2× par mois (1er et 15 à 04:00 UTC).
 * BATCH_SIZE=30, REFRESH_AFTER_DAYS=14 — voir app/api/cron/refresh-enrichment/route.ts.
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
    { path: '/api/cron/enrich-persons-standard', schedule: '0 8 * * *' }, // Étape 2 — Pappers std + BODACC léger, 24h après insertion
    // Étape 3 deep — déclenché inline par /api/suivi/add (immédiat) et
    // rafraîchi par /api/cron/refresh-enrichment (1er et 15). Le cron quotidien
    // /api/cron/enrich-persons est désactivé : il ciblait raw génériquement,
    // ce qui dupliquait l'étape 2 avec Claude. Appel manuel possible si besoin.
    { path: '/api/cron/refresh-enrichment', schedule: '0 4 1,15 * *' },   // Refresh étape 3 — 1er et 15 à 04:00 UTC
    { path: '/api/cron/refresh-rpps', schedule: '0 4 1 * *' },            // Refresh RPPS — 1er du mois à 04:00 UTC
  ],
}

export default config
