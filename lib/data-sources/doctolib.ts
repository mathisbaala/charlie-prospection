// Doctolib URL builder
// Doctolib has no public API and uses Cloudflare-protected SPA pages,
// so server-side scraping isn't viable. We build a high-quality
// pre-filled search URL: name + commune (+ specialty when available).
// One click brings the user to a filtered Doctolib page that typically
// shows 1-3 candidates max.

import { slugify } from '@/lib/utils/slugify'

const PROFESSION_SLUG: Record<string, string> = {
  'médecin généraliste': 'medecin-generaliste',
  'medecin generaliste': 'medecin-generaliste',
  'chirurgien-dentiste': 'dentiste',
  'chirurgien dentiste': 'dentiste',
  'dentiste': 'dentiste',
  'sage-femme': 'sage-femme',
  'sage femme': 'sage-femme',
  'kinésithérapeute': 'kinesitherapeute',
  'masseur-kinésithérapeute': 'kinesitherapeute',
  'masseur kinesitherapeute': 'kinesitherapeute',
  'kinesitherapeute': 'kinesitherapeute',
  'ostéopathe': 'osteopathe',
  'osteopathe': 'osteopathe',
  'orthophoniste': 'orthophoniste',
  'orthoptiste': 'orthoptiste',
  'pédicure-podologue': 'pedicure-podologue',
  'pedicure podologue': 'pedicure-podologue',
  'infirmier': 'infirmier',
  'psychiatre': 'psychiatre',
  'psychologue': 'psychologue',
  'cardiologue': 'cardiologue',
  'dermatologue': 'dermatologue',
  'gynécologue': 'gynecologue-medical',
  'gynecologue': 'gynecologue-medical',
  'ophtalmologue': 'ophtalmologue',
  'pédiatre': 'pediatre',
  'pediatre': 'pediatre',
  'rhumatologue': 'rhumatologue',
  'orl': 'orl',
  'gastro-entérologue': 'gastro-enterologue-et-hepatologue',
  'gastro entérologue': 'gastro-enterologue-et-hepatologue',
  'urologue': 'urologue',
  'radiologue': 'radiologue',
  'chirurgien': 'chirurgien',
  'vétérinaire': 'veterinaire',
  'veterinaire': 'veterinaire',
  'chirurgien-dentiste qualifié en orthopédie dento-faciale': 'orthodontiste',
  'orthodontiste': 'orthodontiste',
}

function professionSlug(profession?: string): string | null {
  if (!profession) return null
  const key = profession.toLowerCase().trim()
  return PROFESSION_SLUG[key] ?? null
}

export function buildDoctolibSearchUrl(params: {
  nom: string
  prenom: string
  commune?: string
  profession?: string
}): string {
  const query = `${params.prenom} ${params.nom}`.trim()
  const slug = professionSlug(params.profession)
  const citySlug = params.commune ? slugify(params.commune) : null

  if (slug && citySlug) {
    return `https://www.doctolib.fr/${slug}/${citySlug}?search_query=${encodeURIComponent(query)}`
  }
  if (slug) {
    return `https://www.doctolib.fr/${slug}?search_query=${encodeURIComponent(query)}`
  }
  if (citySlug) {
    return `https://www.doctolib.fr/search?location=${citySlug}&query=${encodeURIComponent(query)}`
  }
  return `https://www.doctolib.fr/search?query=${encodeURIComponent(query)}`
}
