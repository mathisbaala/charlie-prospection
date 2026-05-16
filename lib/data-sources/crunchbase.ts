import { timedFetch } from '@/lib/observability/logger'

// Crunchbase — levées de fonds et données startup/VC
//
// API  : https://api.crunchbase.com/api/v4/
// Env  : CRUNCHBASE_API_KEY (Crunchbase Basic gratuit limité ou Pro ~$29/mois)
// Docs : https://data.crunchbase.com/docs/using-the-api
//
// Signal CGP :
//   - Fondateur série B/C → exit probable dans 3-5 ans = liquidité future
//   - Total levé > 10M€ → valorisation implicite 50-100M€ → patrimoine latent fort
//   - Investisseur connu (Sequoia, Accel, BPI…) → validation de l'équipe
//
// Scope : pertinent uniquement pour les personas "fondateur tech/startup".
// Pour les médecins libéraux, avocats, dirigeants PME classiques → retourne [].

const BASE = 'https://api.crunchbase.com/api/v4'

export interface LeveeFonds {
  date: string
  serie: string        // "Seed", "Series A", "Series B", etc.
  montant_usd?: number
  investisseurs: string[]
  valorisation_post_money?: number
}

export interface DonneesStartup {
  levees: LeveeFonds[]
  total_leve_usd?: number
  nb_levees?: number
  derniere_levee_date?: string
  derniere_levee_serie?: string
  investisseurs_principaux?: string[]
}

interface CbFundingRound {
  announced_on?: string
  investment_type?: string
  money_raised?: { value_usd?: number }
  post_money_valuation?: { value_usd?: number }
  lead_investor_identifiers?: Array<{ value?: string }>
  investor_identifiers?: Array<{ value?: string }>
}

async function searchOrganization(name: string, apiKey: string): Promise<string | null> {
  try {
    const res = await timedFetch('crunchbase', 'searchOrganization', `${BASE}/autocompletes?query=${encodeURIComponent(name)}&collection_ids=organizations&limit=1&user_key=${apiKey}`, {
      next: { revalidate: 86400 * 7 },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { entities?: Array<{ identifier?: { permalink?: string } }> }
    return data.entities?.[0]?.identifier?.permalink ?? null
  } catch {
    return null
  }
}

export async function getDonneesStartup(
  entrepriseNom: string,
): Promise<DonneesStartup | null> {
  const key = process.env.CRUNCHBASE_API_KEY
  if (!key) return null

  try {
    const permalink = await searchOrganization(entrepriseNom, key)
    if (!permalink) return null

    const url =
      `${BASE}/entities/organizations/${permalink}` +
      `?card_ids=funding_rounds` +
      `&field_ids=funding_total,num_funding_rounds,last_funding_at,last_funding_type,investor_identifiers` +
      `&user_key=${key}`

    const res = await timedFetch('crunchbase', 'getDonneesStartup', url, {
      next: { revalidate: 86400 * 7 },
    })
    if (!res.ok) return null

    const data = (await res.json()) as {
      properties?: {
        funding_total?: { value_usd?: number }
        num_funding_rounds?: number
        last_funding_at?: string
        last_funding_type?: string
        investor_identifiers?: Array<{ value?: string }>
      }
      cards?: {
        funding_rounds?: CbFundingRound[]
      }
    }

    const props = data.properties
    if (!props) return null

    const rounds = (data.cards?.funding_rounds ?? []).map((r): LeveeFonds => ({
      date: r.announced_on ?? '',
      serie: r.investment_type ?? '',
      montant_usd: r.money_raised?.value_usd,
      valorisation_post_money: r.post_money_valuation?.value_usd,
      investisseurs: [
        ...(r.lead_investor_identifiers ?? []).map((i) => i.value ?? ''),
        ...(r.investor_identifiers ?? []).map((i) => i.value ?? ''),
      ].filter(Boolean).slice(0, 5),
    }))

    return {
      levees: rounds,
      total_leve_usd: props.funding_total?.value_usd,
      nb_levees: props.num_funding_rounds,
      derniere_levee_date: props.last_funding_at,
      derniere_levee_serie: props.last_funding_type,
      investisseurs_principaux: (props.investor_identifiers ?? [])
        .map((i) => i.value ?? '')
        .filter(Boolean)
        .slice(0, 5),
    }
  } catch {
    return null
  }
}
