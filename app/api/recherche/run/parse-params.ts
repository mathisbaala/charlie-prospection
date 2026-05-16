import type { RunDiscoveryParams } from '@/lib/discovery'

export function parseDiscoveryParams(body: Record<string, unknown>): RunDiscoveryParams {
  return {
    departement: typeof body.departement === 'string' ? body.departement : undefined,
    naf_code: typeof body.naf_code === 'string' ? body.naf_code : undefined,
    ca_min: typeof body.ca_min === 'number' ? body.ca_min : undefined,
    profession:
      body.rpps_profession === 'Chirurgien-Dentiste'
        ? 'Chirurgien-Dentiste'
        : body.rpps_profession === 'Medecin'
          ? 'Medecin'
          : undefined,
    date_depuis: typeof body.date_depuis === 'string' ? body.date_depuis : undefined,
  }
}
