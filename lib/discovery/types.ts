import type { RawProspect } from '@/lib/prospect-search/engine'

export interface DiscoveryParams {
  departement?: string
  naf_code?: string
  naf_codes?: string[]
  ca_min?: number
  profession?: 'Medecin' | 'Chirurgien-Dentiste' | 'Pharmacien' | 'Kinesitherapeute' | 'Sage-Femme'
  date_depuis?: string
  limit?: number
}

export interface DiscoverySource {
  name: string
  discover(params: DiscoveryParams): Promise<RawProspect[]>
}
