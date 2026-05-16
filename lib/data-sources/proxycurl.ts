import { timedFetch } from '@/lib/observability/logger'

// LinkedIn enrichissement via Proxycurl
//
// API    : https://nubela.co/proxycurl/api/v2/linkedin
// Env    : PROXYCURL_API_KEY (requis — ~$0.01/profil)
// Coût   : uniquement si PROXYCURL_API_KEY est posé, sinon null
//
// IMPORTANT : Proxycurl nécessite une URL de profil réelle (linkedin.com/in/...)
// et non une URL de recherche (linkedin.com/search/...). Si seule l'URL de
// recherche est disponible, le call est skippé silencieusement.
//
// Signal CGP :
//   - Ancienneté dans le poste actuel (>10 ans = dirigeant stable, patrimoine accumulé)
//   - Formation grande école → réseau fort, revenus probablement élevés
//   - Connexions LinkedIn → mesure du capital social / notoriété sectorielle

export interface LinkedinProfileEnriched {
  full_name?: string
  headline?: string
  summary?: string
  current_company?: string
  current_position?: string
  location?: string
  education?: Array<{
    school: string
    degree?: string
    field?: string
    year_end?: number
  }>
  experiences?: Array<{
    company: string
    title: string
    duration_years?: number
  }>
  connections?: number
  profile_url: string
}

interface ProxycurlResponse {
  full_name?: string
  headline?: string
  summary?: string
  company?: string
  job_title?: string
  city?: string
  country?: string
  education?: Array<{
    school?: { name?: string }
    degree_name?: string
    field_of_study?: string
    ends_at?: { year?: number }
  }>
  experiences?: Array<{
    company?: string
    title?: string
    starts_at?: { year?: number }
    ends_at?: { year?: number }
  }>
  connections?: number
}

export async function getLinkedinProfile(
  linkedinUrl: string,
): Promise<LinkedinProfileEnriched | null> {
  const key = process.env.PROXYCURL_API_KEY
  if (!key || !linkedinUrl) return null
  // Only call if URL is a real profile URL — search URLs won't resolve
  if (!linkedinUrl.includes('linkedin.com/in/')) return null

  try {
    const params = new URLSearchParams({
      linkedin_profile_url: linkedinUrl,
      use_cache: 'if-present',
    })
    const url = `https://nubela.co/proxycurl/api/v2/linkedin?${params.toString()}`

    const res = await timedFetch('proxycurl', 'getLinkedinProfile', url, {
      headers: { Authorization: `Bearer ${key}` },
      next: { revalidate: 86400 * 30 }, // refresh mensuel
    })
    if (!res.ok) return null

    const p = (await res.json()) as ProxycurlResponse
    const experiences = (p.experiences ?? []).slice(0, 5).map((e) => {
      const start = e.starts_at?.year
      const end = e.ends_at?.year
      return {
        company: e.company ?? '',
        title: e.title ?? '',
        duration_years: start && end ? end - start : undefined,
      }
    })

    return {
      full_name: p.full_name,
      headline: p.headline,
      summary: p.summary ?? undefined,
      current_company: p.company ?? p.experiences?.[0]?.company ?? undefined,
      current_position: p.job_title ?? p.experiences?.[0]?.title ?? undefined,
      location: [p.city, p.country].filter(Boolean).join(', ') || undefined,
      education: (p.education ?? []).map((e) => ({
        school: e.school?.name ?? '',
        degree: e.degree_name,
        field: e.field_of_study,
        year_end: e.ends_at?.year,
      })),
      experiences,
      connections: p.connections,
      profile_url: linkedinUrl,
    }
  } catch {
    return null
  }
}
