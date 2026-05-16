import { describe, it, expect } from 'vitest'
import {
  classifyActe,
  classifyBodaccPublication,
  minePremiumSignals,
} from '../premium-signal-miner'
import type { PappersPremiumData } from '@/lib/data-sources/pappers'

describe('classifyActe', () => {
  it('detects cession from "Cession de parts"', () => {
    expect(classifyActe({ type: 'Cession de parts sociales' })).toBe('cession')
  })

  it('detects cession from "Vente de fonds de commerce"', () => {
    expect(classifyActe({ type: 'Vente de fonds de commerce' })).toBe('cession')
  })

  it('detects cession from "Transmission universelle de patrimoine"', () => {
    expect(classifyActe({ type: 'Transmission universelle de patrimoine' })).toBe('cession')
  })

  it('detects modif_capital from "Augmentation de capital"', () => {
    expect(classifyActe({ type: 'Augmentation de capital' })).toBe('modif_capital')
  })

  it('detects modif_capital from "Réduction de capital"', () => {
    expect(classifyActe({ type: 'Réduction de capital' })).toBe('modif_capital')
  })

  it('detects radiation from "Dissolution"', () => {
    expect(classifyActe({ type: 'Dissolution anticipée' })).toBe('radiation')
  })

  it('detects procedure_collective from sauvegarde', () => {
    expect(classifyActe({ type: 'Jugement de sauvegarde' })).toBe('procedure_collective')
  })

  it('falls back to modification for "Modification des statuts"', () => {
    expect(classifyActe({ type: 'Modification des statuts' })).toBe('modification')
  })

  it('falls back to autre on empty type', () => {
    expect(classifyActe({})).toBe('autre')
  })
})

describe('classifyBodaccPublication', () => {
  it('detects cession from "Vente"', () => {
    expect(classifyBodaccPublication({ date: '2024-01-01', type: 'Vente' })).toBe('cession')
  })

  it('detects procedure_collective from "Procédure collective"', () => {
    expect(
      classifyBodaccPublication({ date: '2024-01-01', type: 'Procédure collective' }),
    ).toBe('procedure_collective')
  })

  it('detects creation from "Immatriculation"', () => {
    expect(classifyBodaccPublication({ date: '2024-01-01', type: 'Immatriculation' })).toBe(
      'creation',
    )
  })

  it('detects modif_capital from description mentioning augmentation', () => {
    expect(
      classifyBodaccPublication({
        date: '2024-01-01',
        type: 'Modification',
        description: 'Augmentation du capital social à 50000 EUR',
      }),
    ).toBe('modif_capital')
  })
})

describe('minePremiumSignals', () => {
  it('emits one signal per acte in each depot', () => {
    const premium: PappersPremiumData = {
      depots_actes: [
        {
          date_depot: '2024-03-15',
          disponible: true,
          actes: [
            { type: 'Cession de parts sociales', date_acte: '2024-03-10' },
            { type: 'Augmentation de capital', date_acte: '2024-03-10' },
          ],
        },
      ],
      comptes: [],
      publications_bodacc: [],
      cost_jetons: 1,
      fetched_at: '2024-03-20T00:00:00.000Z',
    }
    const signals = minePremiumSignals(premium)
    expect(signals).toHaveLength(2)
    expect(signals[0].type).toBe('cession')
    expect(signals[1].type).toBe('modif_capital')
    expect(signals[0].data.premium_kind).toBe('actes')
  })

  it('emits a placeholder signal when a depot has no itemized actes', () => {
    const premium: PappersPremiumData = {
      depots_actes: [
        {
          date_depot: '2024-03-15',
          disponible: false,
          actes: [],
          nom_fichier_pdf: 'depot-2024-03-15.pdf',
        },
      ],
      comptes: [],
      publications_bodacc: [],
      cost_jetons: 1,
      fetched_at: '2024-03-20T00:00:00.000Z',
    }
    const signals = minePremiumSignals(premium)
    expect(signals).toHaveLength(1)
    expect(signals[0].type).toBe('modification')
    expect(signals[0].data.libelle).toBe('depot-2024-03-15.pdf')
  })

  it('emits depot_comptes signal for each compte', () => {
    const premium: PappersPremiumData = {
      depots_actes: [],
      comptes: [
        {
          date_depot: '2024-05-01',
          date_cloture: '2023-12-31',
          annee_cloture: 2023,
          type_comptes: 'CS',
          confidentialite: false,
          disponible: true,
        },
        {
          date_depot: '2023-05-01',
          date_cloture: '2022-12-31',
          annee_cloture: 2022,
          type_comptes: 'CS',
          confidentialite: false,
          disponible: true,
        },
      ],
      publications_bodacc: [],
      cost_jetons: 1,
      fetched_at: '2024-05-10T00:00:00.000Z',
    }
    const signals = minePremiumSignals(premium)
    expect(signals).toHaveLength(2)
    expect(signals[0].type).toBe('depot_comptes')
    expect(signals[0].data.libelle).toBe('Comptes 2023 (CS)')
  })

  it('emits one signal per BODACC publication and skips entries without date', () => {
    const premium: PappersPremiumData = {
      depots_actes: [],
      comptes: [],
      publications_bodacc: [
        { date: '2024-02-01', type: 'Vente', description: 'Cession totale' },
        { date: '', type: 'Modification' }, // skipped — no date
        { date: '2024-01-05', type: 'Procédure collective' },
      ],
      cost_jetons: 1,
      fetched_at: '2024-03-20T00:00:00.000Z',
    }
    const signals = minePremiumSignals(premium)
    expect(signals).toHaveLength(2)
    expect(signals.map((s) => s.type)).toEqual(['cession', 'procedure_collective'])
  })

  it('produces stable external_ids so re-mining is idempotent against unique index', () => {
    const premium: PappersPremiumData = {
      depots_actes: [
        {
          date_depot: '2024-03-15',
          disponible: true,
          actes: [{ type: 'Cession de parts', date_acte: '2024-03-10' }],
        },
      ],
      comptes: [],
      publications_bodacc: [],
      cost_jetons: 1,
      fetched_at: '2024-03-20T00:00:00.000Z',
    }
    const first = minePremiumSignals(premium)
    const second = minePremiumSignals(premium)
    expect(first[0].data.external_id).toBe(second[0].data.external_id)
    expect(first[0].detected_at).toBe(second[0].detected_at)
  })

  it('returns empty array on empty premium payload', () => {
    const premium: PappersPremiumData = {
      depots_actes: [],
      comptes: [],
      publications_bodacc: [],
      cost_jetons: 1,
      fetched_at: '2024-03-20T00:00:00.000Z',
    }
    expect(minePremiumSignals(premium)).toEqual([])
  })

  it('falls back to "now" when both date_acte and date_depot are missing', () => {
    const premium: PappersPremiumData = {
      depots_actes: [
        {
          date_depot: '',
          disponible: true,
          actes: [{ type: 'Modification' }],
        },
      ],
      comptes: [],
      publications_bodacc: [],
      cost_jetons: 1,
      fetched_at: '2024-03-20T00:00:00.000Z',
    }
    const signals = minePremiumSignals(premium)
    expect(signals).toHaveLength(1)
    // detected_at should be a valid ISO timestamp (the fallback)
    expect(() => new Date(signals[0].detected_at).toISOString()).not.toThrow()
  })
})
