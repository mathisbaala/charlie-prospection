export const ENRICHMENT_STALE_DAYS = 60

// Candidats dropped : bloqués pour éviter le re-fetch, mais réactivables
// après 180 jours (les critères qualité et la situation de la personne évoluent).
export const DROPPED_TTL_DAYS = 180
