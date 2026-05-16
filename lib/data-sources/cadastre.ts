import { timedFetch } from '@/lib/observability/logger'

// Cadastre — parcelles foncières + propriétaire (Foncier Innovant)
//
// Couche 1 — IGN apicarto (GRATUIT, pas de clé)
//   Retourne : référence cadastrale, surface, section, type de local
//   Limite   : adresse → parcelle uniquement, PAS le nom du propriétaire
//
// Couche 2 — Foncier Innovant (PAYANT, ~200-500€/mois)
//   Retourne : propriétaire actuel, historique de propriété, valeur estimée
//   Env      : FONCIER_INNOVANT_API_KEY
//   Docs     : https://www.foncier-innovant.fr/api
//
// Signal CGP :
//   - Superficie totale détenue par le dirigeant (résidence + secondaires)
//   - Résidences secondaires → patrimoine immobilier déjà constitué
//   - Propriétaire de son cabinet (vs locataire) → actif supplémentaire

const IGN_BASE = 'https://apicarto.ign.fr/api/cadastre'
const FONCIER_BASE = 'https://api.foncier-innovant.fr/v1'

export interface ParcelleIgn {
  parcelle_id: string
  section: string
  numero: string
  surface_m2?: number
  code_commune: string
  adresse_approximative?: string
}

export interface ProprieteFoncier {
  parcelle_id: string
  adresse?: string
  surface_m2?: number
  valeur_venale_estimee?: number
  date_derniere_transaction?: string
  type_bien?: string
}

// ── Couche 1 : IGN apicarto — parcelle par coordonnées (free) ─────────────

async function geocodeAdresse(adresse: string, codePostal: string): Promise<{ lon: number; lat: number } | null> {
  try {
    const q = `${adresse} ${codePostal}`
    const res = await timedFetch('ign_geocode', 'geocodeAdresse',
      `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1`,
      { next: { revalidate: 86400 * 30 } },
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      features?: Array<{ geometry?: { coordinates?: [number, number] } }>
    }
    const coords = data.features?.[0]?.geometry?.coordinates
    if (!coords) return null
    return { lon: coords[0], lat: coords[1] }
  } catch {
    return null
  }
}

export async function getParcellesIgn(
  adresse: string,
  codePostal: string,
): Promise<ParcelleIgn[]> {
  const coords = await geocodeAdresse(adresse, codePostal)
  if (!coords) return []

  try {
    const url = `${IGN_BASE}/parcelle?lon=${coords.lon}&lat=${coords.lat}`
    const res = await timedFetch('ign_cadastre', 'getParcellesIgn', url, {
      next: { revalidate: 86400 * 30 },
    })
    if (!res.ok) return []
    const data = (await res.json()) as {
      features?: Array<{
        properties?: {
          id?: string
          section?: string
          numero?: string
          contenance?: number
          commune?: string
        }
      }>
    }
    return (data.features ?? []).map((f): ParcelleIgn => ({
      parcelle_id: f.properties?.id ?? '',
      section: f.properties?.section ?? '',
      numero: f.properties?.numero ?? '',
      surface_m2: f.properties?.contenance,
      code_commune: f.properties?.commune ?? codePostal.slice(0, 5),
      adresse_approximative: adresse,
    }))
  } catch {
    return []
  }
}

// ── Couche 2 : Foncier Innovant — propriété par nom (payant) ──────────────

export async function getProprietésFoncierInnovant(
  nom: string,
  prenom: string,
): Promise<ProprieteFoncier[]> {
  const key = process.env.FONCIER_INNOVANT_API_KEY
  if (!key) return []

  try {
    const url = `${FONCIER_BASE}/owners/search?nom=${encodeURIComponent(nom)}&prenom=${encodeURIComponent(prenom)}&limit=20`
    const res = await timedFetch('foncier_innovant', 'getProprietésFoncierInnovant', url, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      next: { revalidate: 86400 * 7 },
    })
    if (!res.ok) return []
    const data = (await res.json()) as {
      properties?: Array<{
        parcel_id?: string
        address?: string
        area_m2?: number
        estimated_value?: number
        last_transaction_date?: string
        property_type?: string
      }>
    }
    return (data.properties ?? []).map((p): ProprieteFoncier => ({
      parcelle_id: p.parcel_id ?? '',
      adresse: p.address,
      surface_m2: p.area_m2,
      valeur_venale_estimee: p.estimated_value,
      date_derniere_transaction: p.last_transaction_date,
      type_bien: p.property_type,
    }))
  } catch {
    return []
  }
}
