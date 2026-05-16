import { timedFetch } from '@/lib/observability/logger'

// Marques et brevets déposés — EUIPO (marques EU) + INPI marques (France)
//
// EUIPO : API publique, gratuite, sans clé (marques enregistrées au niveau UE)
// INPI  : nécessite INPI_API_TOKEN + accès data.inpi.fr (marques nationales FR)
//
// Signal CGP :
//   - IP détenue = valeur immatérielle de l'entreprise non capturée dans le bilan
//   - Marque déposée récemment → développement actif, investissement en cours
//   - Plusieurs marques sur des activités différentes → holding / diversification

const EUIPO_SEARCH = 'https://euipo.europa.eu/copla/trademark/data/api/v1'

export interface MarqueDeposee {
  numero: string
  denomination: string
  statut: string
  date_depot: string
  date_expiration?: string
  classes?: string[]
  titulaire: string
  source: 'euipo' | 'inpi'
}

interface EuipoTrademark {
  applicationNumber?: string
  wordMarkSpecification?: { markVerbalElementText?: string }
  markCurrentStatusCode?: string
  applicationDate?: string
  expiryDate?: string
  niceClassificationDetails?: Array<{ niceClassCode?: string }>
  applicantDetails?: Array<{ applicantName?: string }>
}

async function searchEuipo(query: string): Promise<MarqueDeposee[]> {
  try {
    const url =
      `${EUIPO_SEARCH}/trademarks?q=${encodeURIComponent(query)}` +
      `&size=10&sort=applicationDate:desc`
    const res = await timedFetch('euipo', 'searchEuipo', url, {
      next: { revalidate: 86400 * 30 },
    })
    if (!res.ok) return []
    const data = (await res.json()) as { trademarks?: EuipoTrademark[] }
    return (data.trademarks ?? []).map((t): MarqueDeposee => ({
      numero: t.applicationNumber ?? '',
      denomination: t.wordMarkSpecification?.markVerbalElementText ?? '',
      statut: t.markCurrentStatusCode ?? '',
      date_depot: t.applicationDate ?? '',
      date_expiration: t.expiryDate ?? undefined,
      classes: (t.niceClassificationDetails ?? [])
        .map((c) => c.niceClassCode ?? '')
        .filter(Boolean),
      titulaire: t.applicantDetails?.[0]?.applicantName ?? query,
      source: 'euipo',
    }))
  } catch {
    return []
  }
}

async function searchInpiMarques(
  query: string,
): Promise<MarqueDeposee[]> {
  const token = process.env.INPI_API_TOKEN
  if (!token) return []
  // INPI marques endpoint (requires data.inpi.fr account + token)
  // Endpoint: https://data.inpi.fr/api/marques/recherche?q={query}
  // If your INPI_API_BASE is the formality API, this may need a separate INPI_MARQUES_BASE
  const base = (process.env.INPI_MARQUES_BASE ?? 'https://data.inpi.fr').replace(/\/$/, '')
  try {
    const url = `${base}/api/marques/recherche?q=${encodeURIComponent(query)}&limit=10`
    const res = await timedFetch('inpi_marques', 'searchInpiMarques', url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      next: { revalidate: 86400 * 30 },
    })
    if (!res.ok) return []
    // INPI marque response shape — adapt if INPI returns a different envelope
    const data = (await res.json()) as {
      marques?: Array<{
        numero?: string
        denomination?: string
        statut?: string
        dateDepot?: string
        dateExpiration?: string
        classes?: string[]
        titulaires?: Array<{ nom?: string }>
      }>
    }
    return (data.marques ?? []).map((m): MarqueDeposee => ({
      numero: m.numero ?? '',
      denomination: m.denomination ?? '',
      statut: m.statut ?? '',
      date_depot: m.dateDepot ?? '',
      date_expiration: m.dateExpiration ?? undefined,
      classes: m.classes ?? [],
      titulaire: m.titulaires?.[0]?.nom ?? query,
      source: 'inpi',
    }))
  } catch {
    return []
  }
}

/**
 * Search for trademarks filed by a person or company.
 * Queries EUIPO (free) + INPI (if token available) in parallel.
 * Deduplicates by numero.
 */
export async function getMarquesDeposees(
  query: string,
): Promise<MarqueDeposee[]> {
  const [euipo, inpi] = await Promise.allSettled([
    searchEuipo(query),
    searchInpiMarques(query),
  ])

  const all: MarqueDeposee[] = [
    ...(euipo.status === 'fulfilled' ? euipo.value : []),
    ...(inpi.status === 'fulfilled' ? inpi.value : []),
  ]

  // Dédup par numéro
  const seen = new Set<string>()
  return all.filter((m) => {
    if (!m.numero || seen.has(m.numero)) return false
    seen.add(m.numero)
    return true
  })
}
