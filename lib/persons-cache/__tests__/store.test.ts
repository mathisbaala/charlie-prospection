import { describe, it, expect } from 'vitest'
import { buildCacheRow } from '../store'
import type { RawProspect } from '@/lib/prospect-search/engine'
import type { ProspectEnrichmentData } from '@/lib/types'

const mockRaw: RawProspect = {
  uid: 'jean|dupont|123456789',
  source: 'pappers',
  source_type: 'personne_morale',
  entreprise_nom: 'DUPONT SAS',
  siren: '123456789',
  code_naf: '86.21Z',
  libelle_naf: 'Médecins généraux',
  date_creation: '2010-01-01',
  tranche_effectifs: '00',
  adresse: '1 rue de la Paix',
  code_postal: '75001',
  ville: 'Paris',
  departement: '75',
  dirigeant_nom: 'Dupont',
  dirigeant_prenom: 'Jean',
  dirigeant_qualite: 'Gérant',
  linkedin_search_url: 'https://www.linkedin.com/search/results/people/?keywords=jean+dupont',
  score_initial: 50,
}

const mockEnrichment: ProspectEnrichmentData = {
  siren: '123456789',
  dirigeant_nom: 'Dupont',
  dirigeant_prenom: 'Jean',
}

describe('buildCacheRow', () => {
  it('construit une ligne avec enrichissement', () => {
    const row = buildCacheRow(mockRaw, mockEnrichment, 70, 'raison principale')
    expect(row.canonical_key).toBe('jean|dupont|123456789')
    expect(row.siren).toBe('123456789')
    expect(row.code_naf).toBe('86.21Z')
    expect(row.departement).toBe('75')
    expect(row.patrimony_score).toBe(70)
    expect(row.enrichment_level).toBe('standard')
    expect(row.discovery_sources).toEqual(['pappers'])
    expect(row.last_enriched_at).not.toBeNull()
    expect(row.enrichment_data?.raison_principale).toBe('raison principale')
  })

  it('construit une ligne raw sans enrichissement', () => {
    const row = buildCacheRow(mockRaw, null, null, null)
    expect(row.enrichment_level).toBe('raw')
    expect(row.enrichment_data).toBeNull()
    expect(row.patrimony_score).toBeNull()
    expect(row.last_enriched_at).toBeNull()
  })

  it('construit une ligne dropped avec level explicite', () => {
    const row = buildCacheRow(mockRaw, null, null, null, 'dropped')
    expect(row.enrichment_level).toBe('dropped')
    expect(row.enrichment_data).toBeNull()
    expect(row.patrimony_score).toBeNull()
    // dropped a un last_enriched_at pour éviter le re-check trop tôt
    expect(row.last_enriched_at).not.toBeNull()
  })
})
