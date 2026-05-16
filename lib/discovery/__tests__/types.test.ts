import { describe, it, expect } from 'vitest'
import type { DiscoveryParams, DiscoverySource } from '../types'
import type { RawProspect } from '@/lib/prospect-search/engine'

describe('DiscoverySource interface', () => {
  it('can be implemented with a discover method returning RawProspect[]', () => {
    const mockSource: DiscoverySource = {
      name: 'test',
      discover: async (_params: DiscoveryParams): Promise<RawProspect[]> => [],
    }
    expect(mockSource.name).toBe('test')
    expect(typeof mockSource.discover).toBe('function')
  })

  it('DiscoveryParams accepts all optional fields', () => {
    const params: DiscoveryParams = {
      departement: '69',
      naf_code: '86.21Z',
      ca_min: 500_000,
      profession: 'Medecin',
      date_depuis: '2026-04-01',
      limit: 20,
    }
    expect(params.departement).toBe('69')
  })

  it('DiscoveryParams works with no fields', () => {
    const params: DiscoveryParams = {}
    expect(params.departement).toBeUndefined()
  })
})
