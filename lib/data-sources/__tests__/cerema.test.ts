import { describe, it, expect } from 'vitest'
import { inferHoldings } from '../cerema'
import type { CeremaMutationRaw } from '../cerema'

const SIREN = '123456789'
const NOM = 'SCI TEST'

function makeBuy(overrides: Partial<CeremaMutationRaw> = {}): CeremaMutationRaw {
  return {
    idmutation: 'buy1',
    datemut: '2022-06-15',
    valeurfonc: 300000,
    sbati: 80,
    l_idpar: ['75001_0001_P_00001'],
    l_adresse: ['12 RUE DE RIVOLI PARIS'],
    libtypbien: 'Appartement',
    siren_acheteur1: SIREN,
    ...overrides,
  }
}

function makeSell(overrides: Partial<CeremaMutationRaw> = {}): CeremaMutationRaw {
  return {
    idmutation: 'sell1',
    datemut: '2024-03-10',
    valeurfonc: 380000,
    l_idpar: ['75001_0001_P_00001'],
    l_adresse: ['12 RUE DE RIVOLI PARIS'],
    siren_vendeur1: SIREN,
    ...overrides,
  }
}

describe('inferHoldings', () => {
  it('returns empty array for no mutations', () => {
    expect(inferHoldings([], SIREN, NOM)).toEqual([])
  })

  it('marks a bought parcel as detenu when not sold', () => {
    const result = inferHoldings([makeBuy()], SIREN, NOM)
    expect(result).toHaveLength(1)
    expect(result[0].statut).toBe('detenu')
    expect(result[0].prix_achat).toBe(300000)
    expect(result[0].entite_nom).toBe(NOM)
  })

  it('marks a parcel as vendu when matching sell exists by id_parcelle', () => {
    const result = inferHoldings([makeBuy(), makeSell()], SIREN, NOM)
    expect(result).toHaveLength(1)
    expect(result[0].statut).toBe('vendu')
  })

  it('marks as vendu when sell matches by normalized address (no id_parcelle)', () => {
    const buy = makeBuy({ l_idpar: [], l_adresse: ['12 RUE DE RIVOLI PARIS'] })
    const sell = makeSell({ l_idpar: [], l_adresse: ['12 Rue de Rivoli  Paris'] })
    const result = inferHoldings([buy, sell], SIREN, NOM)
    expect(result[0].statut).toBe('vendu')
  })

  it('assigns high confidence for recent parcel with id_parcelle not sold', () => {
    const recentBuy = makeBuy({ datemut: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) })
    const result = inferHoldings([recentBuy], SIREN, NOM)
    expect(result[0].confidence).toBe('high')
  })

  it('assigns medium confidence for old parcel with id_parcelle not sold', () => {
    const oldBuy = makeBuy({ datemut: '2015-01-01' })
    const result = inferHoldings([oldBuy], SIREN, NOM)
    expect(result[0].confidence).toBe('medium')
  })

  it('assigns low confidence when no id_parcelle', () => {
    const buy = makeBuy({ l_idpar: [] })
    const result = inferHoldings([buy], SIREN, NOM)
    expect(result[0].confidence).toBe('low')
  })

  it('ignores sell mutations from other SIRENs', () => {
    const sell = makeSell({ siren_vendeur1: '999999999', l_idpar: ['75001_0001_P_00001'] })
    const result = inferHoldings([makeBuy(), sell], SIREN, NOM)
    expect(result[0].statut).toBe('detenu')
  })

  it('returns holdings sorted by date descending', () => {
    const buy1 = makeBuy({ idmutation: 'b1', datemut: '2020-01-01', l_idpar: ['PAR1'] })
    const buy2 = makeBuy({ idmutation: 'b2', datemut: '2023-06-15', l_idpar: ['PAR2'] })
    const result = inferHoldings([buy1, buy2], SIREN, NOM)
    expect(result[0].date_achat).toBe('2023-06-15')
    expect(result[1].date_achat).toBe('2020-01-01')
  })
})
