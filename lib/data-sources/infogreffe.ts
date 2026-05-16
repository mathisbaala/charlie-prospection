// Infogreffe — official portal des greffes (source amont de Pappers / INPI).
//
// Pourquoi un module séparé alors qu'on a déjà Pappers Premium ?
//   1) Pappers couvre ~95% des SIREN actifs au RCS, mais pas tous (sociétés
//      très récentes, structures atypiques, données greffe non encore
//      remontées). Infogreffe est la source officielle, autoritaire.
//   2) Quand Pappers échoue (quota épuisé, API down, payload vide) le CGP
//      a besoin d'un fallback "verify auprès du greffe" en un clic.
//
// On NE scrape PAS Infogreffe — Cloudflare + reCAPTCHA. Pure URL builder,
// même approche pragmatique que CNB / notaires / experts-comptables / doctolib.

const INFOGREFFE_BASE = 'https://www.infogreffe.fr'

export interface InfogreffeLink {
  /** Deep link vers la fiche société sur infogreffe.fr — fonctionne avec SIREN seul,
   *  Infogreffe résout vers la fiche complète. */
  url: string
  /** True quand Pappers n'a renvoyé aucune donnée finance/gouvernance pour ce
   *  SIREN — auquel cas Infogreffe devient le CTA principal de vérification
   *  (et pas juste un lien secondaire). L'UI peut s'en servir pour styler. */
  is_fallback: boolean
}

/**
 * Validate that a SIREN string looks plausible — 9 digits exact, no spaces.
 * Pappers / Annuaire-Entreprises normalisent déjà, mais des données legacy
 * peuvent contenir des SIREN espacés ("123 456 789") ou tronqués.
 */
export function isValidSiren(siren: string | undefined | null): boolean {
  if (!siren) return false
  const clean = siren.replace(/\s+/g, '')
  return /^\d{9}$/.test(clean)
}

/**
 * Build the canonical Infogreffe deep-link for a SIREN. Infogreffe accepts the
 * raw SIREN in path and redirects to the full slugified URL with the company
 * name — useful for the CGP who wants to verify legal status, extraits Kbis,
 * actes au greffe directement à la source officielle.
 *
 * Returns null when SIREN shape is invalid — caller skips the field entirely.
 */
export function buildInfogreffeUrl(
  siren: string | undefined | null,
  opts?: { is_fallback?: boolean },
): InfogreffeLink | null {
  if (!isValidSiren(siren)) return null
  const clean = siren!.replace(/\s+/g, '')
  return {
    url: `${INFOGREFFE_BASE}/societes/entreprise-societe/${clean}`,
    is_fallback: opts?.is_fallback ?? false,
  }
}
