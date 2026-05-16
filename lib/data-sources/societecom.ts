import { timedFetch } from '@/lib/observability/logger'

// Societe.com — score de crédit et santé financière de l'entreprise
//
// API  : https://api.societe.com/api/v1/
// Env  : SOCIETECOM_API_KEY (inscription sur societe.com/api, ~0.05-0.20€/requête)
// Docs : https://developer.societe.com/
//
// Signal CGP :
//   - Score de crédit faible → entreprise en difficulté, éviter ou attendre
//   - Incidents de paiement → risque de procédure collective, ne pas prospecter
//   - Score élevé + croissance → dirigeant en position de force → bon timing
//
// Complément à Pappers Premium : Societe.com agrège Altares/Coface scores,
// Pappers n'expose pas ces indices de risque de paiement.

const BASE = 'https://api.societe.com/api/v1'

export interface CreditEntreprise {
  score_credit?: number          // 0-100, 100 = excellent
  risque?: 'faible' | 'moyen' | 'eleve' | 'tres_eleve'
  incidents_paiement?: number    // nombre d'incidents déclarés
  encours_client_estime?: number // en euros
  probabilite_defaillance?: number // 0-1
  source: 'societecom'
}

interface SocieteComRatios {
  scoreCreditSafe?: number
  libelleScoreCreditSafe?: string
  nombreIncidentsPaiement?: number
  encoursPME?: number
  probabiliteDefaillance?: number
}

export async function getCreditEntreprise(siren: string): Promise<CreditEntreprise | null> {
  const key = process.env.SOCIETECOM_API_KEY
  if (!key) return null

  try {
    const url = `${BASE}/entreprise/${siren}/ratiossynthetiques/v2?token=${key}`
    const res = await timedFetch('societecom', 'getCreditEntreprise', url, {
      next: { revalidate: 86400 * 7 },
    })
    if (!res.ok) return null

    const data = (await res.json()) as { ratios?: SocieteComRatios }
    const r = data.ratios
    if (!r) return null

    const score = r.scoreCreditSafe
    let risque: CreditEntreprise['risque'] = undefined
    if (score !== undefined) {
      if (score >= 75) risque = 'faible'
      else if (score >= 50) risque = 'moyen'
      else if (score >= 25) risque = 'eleve'
      else risque = 'tres_eleve'
    }

    return {
      score_credit: score,
      risque,
      incidents_paiement: r.nombreIncidentsPaiement,
      encours_client_estime: r.encoursPME,
      probabilite_defaillance: r.probabiliteDefaillance,
      source: 'societecom',
    }
  } catch {
    return null
  }
}
