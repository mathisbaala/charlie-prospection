import type { DiscoverySourceName } from '@/lib/discovery'

const VALID_SOURCES: DiscoverySourceName[] = ['pappers-naf', 'bodacc-cessions', 'rpps']

export interface ParsedDiscoveryParams {
  sources: DiscoverySourceName[]
  naf_code?: string
  ca_min?: number
  profession?: 'Medecin' | 'Chirurgien-Dentiste'
  date_depuis?: string
  departement?: string
}

export function parseDiscoveryParams(body: Record<string, unknown>): ParsedDiscoveryParams {
  const rawSources = Array.isArray(body.sources) ? body.sources : []
  const sources = rawSources.filter((s): s is DiscoverySourceName =>
    VALID_SOURCES.includes(s as DiscoverySourceName),
  )

  return {
    sources,
    naf_code: typeof body.naf_code === 'string' ? body.naf_code : undefined,
    ca_min: typeof body.ca_min === 'number' ? body.ca_min : undefined,
    profession:
      body.rpps_profession === 'Chirurgien-Dentiste' ? 'Chirurgien-Dentiste' :
      body.rpps_profession === 'Medecin' ? 'Medecin' : undefined,
    date_depuis: typeof body.date_depuis === 'string' ? body.date_depuis : undefined,
    departement: typeof body.departement === 'string' ? body.departement : undefined,
  }
}
