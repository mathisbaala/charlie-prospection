import { type VercelConfig } from '@vercel/config/v1'

/**
 * Charlie Prospection — Vercel project configuration.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                  PIPELINE D'ENRICHISSEMENT EN 3 ÉTAPES                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 *  Étape 1 — COLLECTE (scripts locaux, pas de cron Vercel)
 *    Scripts : ingest-rpps-bulk.ts, ingest-ae.ts, after-rpps.sh…
 *    → prospection_persons avec enrichment_level='raw'
 *    → upsertPersons() via @/lib/persons/store
 *    Volume : ~600k personnes, toutes professions libérales cibles
 *
 *  Étape 2 — STANDARD (cron quotidien 08:00 UTC)
 *    → /api/cron/enrich-persons-standard
 *    Cible : enrichment_level='raw' ET created_at < now()-24h. Batch 50.
 *    Sources : Pappers standard (1 token/SIREN) + BODACC léger (gratuit).
 *    Pas de Claude. Score règles métier (profession + géo + Pappers).
 *    → enrichment_level='standard'
 *    Refresh : TODO — pas encore implémenté. Les profils standard sont
 *    mis à jour si repassés en suivi (étape 3). Un cron de refresh
 *    bulk standard (2×/an) sera ajouté quand le volume le justifiera.
 *
 *  Étape 3 — DEEP (déclenché à la demande + refresh mensuel)
 *    Déclencheur initial : /api/suivi/add (inline, immédiat, dès la mise en suivi)
 *    Sources : Pappers premium + portfolio dirigeant + 10+ sources (BODACC 50 events,
 *    INPI RNE actes, Transparence Santé, Proxycurl, EUIPO marques, BALO dividendes,
 *    Societe.com, Crunchbase, Cadastre IGN, Foncier Innovant) + Claude Sonnet scoring.
 *    → enrichment_level='deep' (PERSISTANT cross-org — jamais rétrogradé)
 *    Refresh : /api/cron/refresh-enrichment (1er et 15 à 04:00 UTC, batch 20)
 *    Seulement les prospects en suivi (icp_id IS NOT NULL).
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                    RÈGLE D'AFFICHAGE CÔTÉ CGP                          │
 * │  search_persons_by_criteria filtre WHERE enrichment_level IN           │
 * │  ('standard', 'deep') — jamais 'raw'. Un profil brut n'est jamais      │
 * │  présenté à la recherche, même s'il a déjà un score quick-score.       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Daily firehose pipeline (all times UTC):
 *   05:30  sirene-ingest    → INSEE Sirene v3.11 firehose (24h window)
 *   05:45  inpi-ingest      → INPI RNE daily diff
 *   06:00  bodacc-ingest    → BODACC annonces commerciales 24h
 *   06:30  match-icps       → Signaux inbox → prospects en suivi (all SIRENs)
 *   08:00  enrich-persons-standard → Étape 2 (raw → standard, sans Claude)
 *
 * Crons périodiques :
 *   1er et 15 à 04:00  refresh-enrichment  → Étape 3 refresh (suivi only)
 *   1er à 04:00        refresh-rpps        → Rechargement cache RPPS complet
 *
 * Crons désactivés :
 *   /api/cron/enrich-persons → ciblait 'raw' avec Claude (doublon de l'étape 2).
 *   Route accessible manuellement mais hors planning automatique.
 *
 * Auth : toutes les routes cron requièrent Authorization: Bearer $CRON_SECRET.
 * Vercel injecte le header automatiquement sur les invocations planifiées.
 * Appel manuel possible avec curl -H "Authorization: Bearer $CRON_SECRET".
 *
 * Vercel Hobby : jusqu'à 100 cron jobs, cadence minimale 1/jour par job.
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
