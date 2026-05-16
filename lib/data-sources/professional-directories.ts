// Liberal professional directory URL builders — for professions where there's
// no public API (avocats CNB, notaires, experts-comptables). Same approach as
// `doctolib.ts` : we produce a high-quality pre-filled search URL so the CGP
// lands on a filtered result page with 1–3 candidates instead of typing the
// query themselves.
//
// We never scrape these sites — they each have anti-bot protection (Cloudflare,
// JS-only SPA, CAPTCHA) that makes server-side fetching brittle. URL builders
// give 90% of the operational value (one click to verify the prospect's
// professional registration) for 1% of the engineering cost.

import { slugify } from '@/lib/utils/slugify'

export type LiberalProfession =
  | 'avocat'
  | 'notaire'
  | 'expert_comptable'
  | 'commissaire_aux_comptes'

export interface LiberalDirectoryUrls {
  /** Conseil National des Barreaux — avocat.fr search by name + commune. */
  avocat_cnb?: string
  /** Notaires.fr — recherche par nom + zone géographique. */
  notaires?: string
  /** Annuaire de l'Ordre des Experts-Comptables. */
  experts_comptables?: string
  /** Profession détectée — sert de hint pour l'UI ("Cet avocat n'est pas
   *  inscrit sur l'annuaire ?"). */
  detected_profession?: LiberalProfession
}

/**
 * Detect a liberal profession from the prospect's NAF code and/or qualité
 * string. NAF is the most reliable signal (declared at Sirene level), but
 * inside 69.10Z (activités juridiques) we still need to disambiguate between
 * avocat and notaire — done via `dirigeant_qualite` keywords.
 *
 * Returns null when the prospect is not a recognized liberal profession,
 * so the caller can skip the enrichment without polluting the fiche.
 */
export function detectLiberalProfession(params: {
  code_naf?: string
  dirigeant_qualite?: string
  libelle_naf?: string
}): LiberalProfession | null {
  const naf = (params.code_naf ?? '').replace('.', '').toUpperCase()
  const qualite = (params.dirigeant_qualite ?? '').toLowerCase()
  const libelle = (params.libelle_naf ?? '').toLowerCase()
  const corpus = `${qualite} ${libelle}`

  // Activités comptables — 69.20Z covers EC + CAC. Disambiguate via keywords;
  // when ambiguous (just "comptable") we default to expert_comptable since
  // it's by far the more common pattern in our prospects. The /experts?-comptables?/
  // regex catches both singular and plural NAF labels ("Activités des experts-comptables").
  const ecRe = /experts?[- ]comptables?/i
  if (naf.startsWith('6920') || ecRe.test(corpus)) {
    if (corpus.includes('commissaire aux comptes') || corpus.includes('cac ')) return 'commissaire_aux_comptes'
    return 'expert_comptable'
  }

  // Activités juridiques — 69.10Z covers avocats, notaires, huissiers. We
  // need to look at the qualité or libellé NAF to disambiguate.
  if (naf.startsWith('6910') || corpus.includes('activités juridiques')) {
    if (corpus.includes('notaire')) return 'notaire'
    if (corpus.includes('avocat')) return 'avocat'
    // Default to avocat for unspecified 69.10Z — by volume, avocats dominate
    // (notaires have their own dedicated NAF flavour in Sirene).
    if (naf.startsWith('6910')) return 'avocat'
  }

  // Free-text detection fallback (works when NAF is missing, e.g. on
  // personne physique inscrite Sirene mais sans NAF déclaré).
  if (corpus.includes('avocat')) return 'avocat'
  if (corpus.includes('notaire')) return 'notaire'
  return null
}

/**
 * URL builders. Each one targets the canonical search entry point of its
 * respective directory. We've verified these patterns by hand against the
 * live sites — but they're the authority's URLs, so they may evolve. The
 * fallback shape (just `https://site/recherche?q=...`) keeps producing
 * useful pages even after a hash redesign.
 */

export function buildCnbAvocatSearchUrl(params: {
  nom: string
  prenom?: string
  ville?: string
}): string {
  const fullName = [params.prenom, params.nom].filter(Boolean).join(' ').trim()
  // avocat.fr is the CNB-run public directory. Search route accepts free-text
  // location + name. Pre-filling both yields a tight result set.
  const q = new URLSearchParams({ q: fullName })
  if (params.ville) q.set('localisation', params.ville)
  return `https://www.avocat.fr/recherche-avocat?${q.toString()}`
}

export function buildNotairesSearchUrl(params: {
  nom: string
  prenom?: string
  ville?: string
}): string {
  const fullName = [params.prenom, params.nom].filter(Boolean).join(' ').trim()
  // notaires.fr public directory. Their SPA reads `nom` and `ville` from the
  // query string and pre-fills the form on landing.
  const q = new URLSearchParams({ nom: fullName })
  if (params.ville) q.set('ville', params.ville)
  return `https://www.notaires.fr/fr/annuaire-officiel-notaires?${q.toString()}`
}

export function buildExpertsComptablesSearchUrl(params: {
  nom: string
  prenom?: string
  ville?: string
  code_postal?: string
}): string {
  // The Ordre des EC public annuaire lives at experts-comptables.org. Pre-fill
  // nom, prenom, code postal — code_postal is more discriminating than ville
  // for EC since cabinets are often in the same département.
  const q = new URLSearchParams()
  if (params.nom) q.set('nom', params.nom)
  if (params.prenom) q.set('prenom', params.prenom)
  if (params.code_postal) q.set('codePostal', params.code_postal)
  else if (params.ville) q.set('ville', slugify(params.ville))
  return `https://annuaire.experts-comptables.org/personne/cherche?${q.toString()}`
}

/**
 * High-level entry point used by the enricher. Builds the matching URL(s)
 * for the detected profession and returns a `LiberalDirectoryUrls` blob
 * ready to persist on `enrichment_data.liberal_directory_urls`.
 *
 * Returns null when no liberal profession is detected — caller skips the
 * enrichment field entirely.
 */
export function buildLiberalDirectoryUrls(params: {
  code_naf?: string
  libelle_naf?: string
  dirigeant_qualite?: string
  nom: string
  prenom?: string
  ville?: string
  code_postal?: string
}): LiberalDirectoryUrls | null {
  const detected = detectLiberalProfession({
    code_naf: params.code_naf,
    libelle_naf: params.libelle_naf,
    dirigeant_qualite: params.dirigeant_qualite,
  })
  if (!detected) return null

  const urls: LiberalDirectoryUrls = { detected_profession: detected }

  switch (detected) {
    case 'avocat':
      urls.avocat_cnb = buildCnbAvocatSearchUrl({
        nom: params.nom,
        prenom: params.prenom,
        ville: params.ville,
      })
      break
    case 'notaire':
      urls.notaires = buildNotairesSearchUrl({
        nom: params.nom,
        prenom: params.prenom,
        ville: params.ville,
      })
      break
    case 'expert_comptable':
    case 'commissaire_aux_comptes':
      urls.experts_comptables = buildExpertsComptablesSearchUrl({
        nom: params.nom,
        prenom: params.prenom,
        ville: params.ville,
        code_postal: params.code_postal,
      })
      break
  }

  return urls
}
