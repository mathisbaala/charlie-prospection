import { timedFetch } from '@/lib/observability/logger'

const BASE = 'https://api.dvf.etalab.gouv.fr/dvf/1.0'

export interface DvfRecord {
  id_mutation: string
  date_mutation: string
  nature_mutation: string
  valeur_fonciere: number
  adresse_numero?: string
  adresse_voie?: string
  code_commune: string
  nom_commune: string
  code_departement: string
  type_local?: string
  surface_reelle_bati?: number
  nombre_pieces_principales?: number
}

export async function getDvfByCommune(codeCommune: string, minValeur = 0, limit = 20): Promise<DvfRecord[]> {
  try {
    const url = `${BASE}/communes/${codeCommune}/dvf/?page=1&page_size=${limit}`
    const res = await timedFetch('dvf', 'getDvfByCommune', url, { next: { revalidate: 86400 } })
    if (!res.ok) return []
    const data = await res.json()
    const results: DvfRecord[] = data.results ?? []
    return results.filter(r => r.valeur_fonciere >= minValeur)
  } catch {
    return []
  }
}

export async function getDvfEnrichmentForProspect(codeCommune: string): Promise<{
  transactions: DvfRecord[]
  valeur_totale_estimee: number
  nb_transactions: number
}> {
  const transactions = await getDvfByCommune(codeCommune, 300_000, 10)
  const valeur_totale_estimee = transactions.reduce((sum, t) => sum + (t.valeur_fonciere ?? 0), 0)
  return { transactions, valeur_totale_estimee, nb_transactions: transactions.length }
}
