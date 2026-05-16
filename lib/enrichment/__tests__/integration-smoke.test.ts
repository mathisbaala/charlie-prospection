// Integration smoke test — exercises the full new pipeline with realistic
// Pappers Premium-shaped data + address parsing edge cases. Not a unit test
// of any single module: this is the cross-module shape check that catches
// type drift between data-sources/, enrichment/ and the persistence helper.

import { describe, it, expect, afterEach, vi } from 'vitest'
import { minePremiumSignals } from '../premium-signal-miner'
import { splitAddressLine } from '../enricher'
import type { PappersPremiumData } from '@/lib/data-sources/pappers'

describe('splitAddressLine — Pappers/Annuaire-Entreprises formats', () => {
  it('parses standard "12 RUE DE LA REPUBLIQUE"', () => {
    expect(splitAddressLine('12 RUE DE LA REPUBLIQUE')).toEqual({
      numero: '12',
      voie: 'RUE DE LA REPUBLIQUE',
    })
  })

  it('parses lowercase "14 rue des Lilas"', () => {
    expect(splitAddressLine('14 rue des Lilas')).toEqual({
      numero: '14',
      voie: 'rue des Lilas',
    })
  })

  it('handles "12 BIS RUE DE LA REPUBLIQUE"', () => {
    expect(splitAddressLine('12 BIS RUE DE LA REPUBLIQUE')).toEqual({
      numero: '12 BIS',
      voie: 'RUE DE LA REPUBLIQUE',
    })
  })

  it('handles "12 ter avenue des Champs"', () => {
    expect(splitAddressLine('12 ter avenue des Champs')).toEqual({
      numero: '12 ter',
      voie: 'avenue des Champs',
    })
  })

  it('returns no numero when address starts with text ("ZA DU GRAND CHEMIN")', () => {
    expect(splitAddressLine('ZA DU GRAND CHEMIN')).toEqual({
      numero: '',
      voie: 'ZA DU GRAND CHEMIN',
    })
  })

  it('handles three-digit numbers ("125 rue de Vaugirard")', () => {
    expect(splitAddressLine('125 rue de Vaugirard')).toEqual({
      numero: '125',
      voie: 'rue de Vaugirard',
    })
  })

  it('returns empty on undefined input', () => {
    expect(splitAddressLine(undefined)).toEqual({ numero: '', voie: '' })
  })

  it('returns empty on empty string', () => {
    expect(splitAddressLine('')).toEqual({ numero: '', voie: '' })
  })

  it('trims leading whitespace', () => {
    expect(splitAddressLine('  12 RUE DE LA PAIX  ')).toEqual({
      numero: '12',
      voie: 'RUE DE LA PAIX',
    })
  })
})

describe('Premium signal miner — realistic Pappers v2 payload shape', () => {
  // This mirrors what an actual /v2/entreprise call with Premium flags returns
  // for a moderately active SARL — verified against the Pappers docs and a
  // live probe on 2026-05-16.
  const realisticPayload: PappersPremiumData = {
    depots_actes: [
      {
        date_depot: '2024-03-15',
        date_depot_formate: '15 mars 2024',
        disponible: true,
        nom_fichier_pdf: 'depot-2024-03-15.pdf',
        token: 'tok_a1b2c3d4e5f6g7h8',
        actes: [
          {
            type: 'Procès-verbal d\'assemblée générale',
            decision: 'Augmentation de capital de 50 000 EUR',
            date_acte: '2024-03-10',
            date_acte_formate: '10 mars 2024',
          },
          {
            type: 'Statuts mis à jour',
            decision: null,
            date_acte: '2024-03-10',
          },
        ],
      },
      {
        date_depot: '2023-06-20',
        disponible: true,
        token: 'tok_xyz9876543210abc',
        actes: [
          {
            type: 'Cession de parts sociales',
            decision: 'Cession de 100% des parts à M. Durand',
            date_acte: '2023-06-15',
          },
        ],
      },
    ],
    comptes: [
      {
        date_depot: '2024-05-01',
        date_cloture: '2023-12-31',
        annee_cloture: 2023,
        type_comptes: 'CS',
        confidentialite: false,
        disponible: true,
        token: 'tok_comptes_2023',
        nom_fichier_pdf: 'comptes-2023.pdf',
        disponible_xlsx: true,
        token_xlsx: 'tok_comptes_2023_xlsx',
        nom_fichier_xlsx: 'comptes-2023.xlsx',
      },
      {
        date_depot: '2023-05-01',
        date_cloture: '2022-12-31',
        annee_cloture: 2022,
        type_comptes: 'CS',
        confidentialite: true,
        confidentialite_compte_de_resultat: true,
        disponible: true,
        token: 'tok_comptes_2022',
      },
    ],
    publications_bodacc: [
      {
        date: '2024-04-02',
        bodacc: 'A',
        type: 'Modification',
        description: 'Augmentation du capital social',
        rcs: 'PARIS',
        greffe: 'Paris',
        capital: 100000,
        denomination: 'TEST SARL',
      },
      {
        date: '2023-07-10',
        bodacc: 'A',
        type: 'Vente',
        description: 'Cession de fonds de commerce',
        rcs: 'PARIS',
      },
    ],
    cost_jetons: 1,
    fetched_at: '2024-05-16T10:00:00.000Z',
  }

  it('produces the expected signal count from realistic payload', () => {
    const signals = minePremiumSignals(realisticPayload)
    // 2 actes from first depot + 1 acte from second depot + 2 comptes + 2 BODACC pubs
    expect(signals).toHaveLength(7)
  })

  it('classifies actes correctly across realistic types', () => {
    const signals = minePremiumSignals(realisticPayload)
    const acteSignals = signals.filter((s) => s.data.premium_kind === 'actes')
    expect(acteSignals).toHaveLength(3)

    // "Procès-verbal d'AG" with "Augmentation de capital" → modif_capital (decision has capital+augmentation)
    expect(acteSignals[0].type).toBe('modif_capital')
    // "Statuts mis à jour" → modification
    expect(acteSignals[1].type).toBe('modification')
    // "Cession de parts sociales" → cession
    expect(acteSignals[2].type).toBe('cession')
  })

  it('all comptes become depot_comptes signals with annee in libelle', () => {
    const signals = minePremiumSignals(realisticPayload)
    const compteSignals = signals.filter((s) => s.data.premium_kind === 'comptes')
    expect(compteSignals).toHaveLength(2)
    expect(compteSignals.every((s) => s.type === 'depot_comptes')).toBe(true)
    expect(compteSignals[0].data.libelle).toContain('2023')
    expect(compteSignals[1].data.libelle).toContain('2022')
  })

  it('BODACC "Vente" → cession, "Modification + augmentation" → modif_capital', () => {
    const signals = minePremiumSignals(realisticPayload)
    const bodaccSignals = signals.filter((s) => s.data.premium_kind === 'bodacc')
    expect(bodaccSignals).toHaveLength(2)
    expect(bodaccSignals[0].type).toBe('modif_capital')
    expect(bodaccSignals[1].type).toBe('cession')
  })

  it('all signals have ISO timestamps suitable for Postgres timestamptz', () => {
    const signals = minePremiumSignals(realisticPayload)
    for (const s of signals) {
      // Round-trip through Date — should produce identical ISO string.
      const parsed = new Date(s.detected_at)
      expect(parsed.toISOString()).toBe(s.detected_at)
    }
  })

  it('external_ids are unique across the full payload', () => {
    const signals = minePremiumSignals(realisticPayload)
    const ids = signals.map((s) => s.data.external_id)
    const uniq = new Set(ids)
    expect(uniq.size).toBe(signals.length)
  })

  it('all signals carry source=pappers (required by the DB check constraint)', () => {
    const signals = minePremiumSignals(realisticPayload)
    expect(signals.every((s) => s.source === 'pappers')).toBe(true)
  })
})

describe('persistPremiumSignals — graceful failure modes', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('returns 0 inserted on undefined premium payload', async () => {
    const { persistPremiumSignals } = await import('../persist-premium-signals')
    const fakeClient = {} as never
    const result = await persistPremiumSignals(fakeClient, 'p1', 'org1', undefined)
    expect(result).toEqual({ inserted: 0, max_detected_at: null })
  })

  it('returns 0 inserted on empty arrays', async () => {
    const { persistPremiumSignals } = await import('../persist-premium-signals')
    const fakeClient = {} as never
    const result = await persistPremiumSignals(fakeClient, 'p1', 'org1', {
      depots_actes: [],
      comptes: [],
      publications_bodacc: [],
      cost_jetons: 1,
      fetched_at: new Date().toISOString(),
    })
    expect(result).toEqual({ inserted: 0, max_detected_at: null })
  })

  it('swallows upsert errors instead of throwing', async () => {
    const { persistPremiumSignals } = await import('../persist-premium-signals')
    // Build a minimal client stub that simulates an upsert error.
    const errorClient = {
      from: () => ({
        upsert: () =>
          Promise.resolve({ error: { message: 'simulated db error' }, count: null }),
      }),
    } as never
    const result = await persistPremiumSignals(errorClient, 'p1', 'org1', {
      depots_actes: [
        {
          date_depot: '2024-01-01',
          disponible: true,
          actes: [{ type: 'Cession' }],
        },
      ],
      comptes: [],
      publications_bodacc: [],
      cost_jetons: 1,
      fetched_at: new Date().toISOString(),
    })
    expect(result.inserted).toBe(0)
    expect(result.max_detected_at).toBeNull()
  })
})
