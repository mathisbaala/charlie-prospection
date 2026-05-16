import { timedFetch } from '@/lib/observability/logger'

// Transparence.sante.gouv.fr — avantages reçus par les professionnels de santé
//
// Open data, API OpenDataSoft, gratuit, aucune clé requise.
// Scope : tout professionnel de santé (médecins, dentistes, pharmaciens, kinés…)
//
// Signal CGP :
//   - Médecin KOL (Key Opinion Leader) = revenus complémentaires significatifs
//     (congrès, honoraires expertise, repas labos) + réseau fort → prospect
//     patrimonial plus complexe et plus riche que le généraliste lambda.
//   - Montants élevés = indicateur de revenus libéraux réels > tarif conventionnel.

const BASE = 'https://data.transparence.sante.gouv.fr/api/explore/v2.1/catalog/datasets'
const DATASET = 'transparence-sante'

export interface AvantageTransparence {
  date: string
  entreprise: string
  montant_ttc?: number
  nature_lien: string
  objet?: string
}

interface TransparenceRecord {
  date_debut_avantage?: string
  denomination_sociale_entreprise_1?: string
  montant_ttc_avantage?: number
  nature_lien_interet?: string
  objet_avantage?: string
}

export async function getAvantagesSante(
  nom: string,
  prenom: string,
): Promise<AvantageTransparence[]> {
  try {
    const where = `beneficiaire_nom like "${nom.toUpperCase()}" AND beneficiaire_prenom like "${prenom}"`
    const url =
      `${BASE}/${DATASET}/records` +
      `?where=${encodeURIComponent(where)}` +
      `&limit=20&order_by=date_debut_avantage%20desc`

    const res = await timedFetch('transparence_sante', 'getAvantagesSante', url, {
      next: { revalidate: 86400 * 7 },
    })
    if (!res.ok) return []

    const data = (await res.json()) as { results?: TransparenceRecord[] }
    return (data.results ?? []).map((r): AvantageTransparence => ({
      date: r.date_debut_avantage ?? '',
      entreprise: r.denomination_sociale_entreprise_1 ?? '',
      montant_ttc: r.montant_ttc_avantage,
      nature_lien: r.nature_lien_interet ?? '',
      objet: r.objet_avantage ?? undefined,
    }))
  } catch {
    return []
  }
}
