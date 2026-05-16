import { timedFetch } from '@/lib/observability/logger'

// INPI RNE — actes et formalités par SIREN (enrichissement suivi, pas discovery)
//
// Source primaire pour tous les actes juridiques d'une entreprise :
// statuts, PV d'AGO, cessions de parts, modifications de capital, bénéficiaires.
// Certains actes INPI ne remontent pas chez Pappers (délai ou couverture partielle).
//
// Setup :
//   INPI_API_TOKEN  → Bearer token issu de data.inpi.fr (même que le cron inpi-ingest)
//   INPI_API_BASE   → URL racine, ex. https://api.inpi.fr/formality
//
// Dégrade gracieusement à [] si le token est absent.

const PUBLIC_RNE_BASE = 'https://registre-national-entreprises.inpi.fr/api/v1'

export interface ActeRne {
  id: string
  date: string
  type: string
  libelle: string
  documents?: Array<{ url: string; nom: string }>
}

interface RneFormality {
  id?: string
  dateEvenement?: string
  typeEvenement?: string
  [key: string]: unknown
}

interface RneApiResponse {
  formalities?: RneFormality[]
  company?: {
    siren?: string
    denomination?: string
    formalities?: RneFormality[]
  }
  // Some INPI tracks return root array
  [key: string]: unknown
}

const SKIP_TYPES = new Set(['DEPOT_COMPTES', 'depot_comptes'])

function mapType(t: string): string {
  const v = t.toUpperCase()
  if (v.includes('CESSION')) return 'Cession de parts'
  if (v.includes('CAPITAL')) return 'Modification de capital'
  if (v.includes('BENEFICIAIRE')) return 'Modification bénéficiaires effectifs'
  if (v.includes('DIRIGEANT')) return 'Changement de dirigeant'
  if (v.includes('DISSOLUTION')) return 'Dissolution'
  if (v.includes('DEPOT_ACTES') || v.includes('ACTES')) return 'Dépôt d\'actes'
  if (v.includes('STATUTS')) return 'Mise à jour des statuts'
  if (v.includes('PV') || v.includes('AGO') || v.includes('AGE')) return 'PV d\'assemblée'
  if (v.includes('TRANSFERT')) return 'Transfert de siège'
  return t
}

function extractFormalities(formalities: RneFormality[]): ActeRne[] {
  const results: ActeRne[] = []
  for (const f of formalities) {
    const type = (f.typeEvenement as string | undefined) ?? ''
    if (SKIP_TYPES.has(type)) continue

    results.push({
      id: (f.id as string | undefined) ?? `${f.dateEvenement ?? ''}-${type}`,
      date: (f.dateEvenement as string | undefined) ?? '',
      type,
      libelle: mapType(type),
    })
  }
  return results.sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * Fetch formalities for a company from the INPI RNE API.
 *
 * Strategy:
 *   1. If INPI_API_TOKEN + INPI_API_BASE → use authenticated token API
 *   2. If not → try the public RNE search endpoint (no auth, limited fields)
 *   3. On any failure → []
 */
export async function getActesRneBySiren(siren: string): Promise<ActeRne[]> {
  const token = process.env.INPI_API_TOKEN
  const base = process.env.INPI_API_BASE?.replace(/\/$/, '')

  if (token && base) {
    try {
      const url = `${base}/companies/${siren}/formalities?limit=50`
      const res = await timedFetch('inpi', 'getActesRneBySiren', url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        next: { revalidate: 86400 },
      })
      if (res.ok) {
        const data = (await res.json()) as RneApiResponse
        const formalities =
          (data.formalities as RneFormality[] | undefined) ??
          (data.company?.formalities as RneFormality[] | undefined) ??
          []
        if (formalities.length > 0) return extractFormalities(formalities)
      }
    } catch {
      // Fall through to public
    }
  }

  // Public RNE API — returns company formalities without auth on some tracks
  try {
    const url = `${PUBLIC_RNE_BASE}/companies/${siren}`
    const res = await timedFetch('inpi_public', 'getActesRneBySiren', url, {
      next: { revalidate: 86400 },
    })
    if (!res.ok) return []
    const data = (await res.json()) as RneApiResponse
    const formalities =
      (data.formalities as RneFormality[] | undefined) ??
      (data.company?.formalities as RneFormality[] | undefined) ??
      []
    return extractFormalities(formalities)
  } catch {
    return []
  }
}
