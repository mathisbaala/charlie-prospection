import { describe, it, expect, afterEach, vi } from 'vitest'

// Test the address-matching DVF flow. We mock timedFetch to return a known
// geo-dvf CSV payload and verify the candidates come back with the right
// confidence tiers — high (exact match), medium (voie match, num diff),
// low (token overlap only). Filtering correctness is the contract that
// determines whether the patrimony fiche shows noise or signal.

type CsvRow = {
  id_mutation: string
  date_mutation: string
  nature_mutation: string
  valeur_fonciere: number | string
  adresse_numero?: string
  adresse_nom_voie?: string
  code_commune?: string
  nom_commune?: string
  code_departement?: string
  type_local?: string
  surface_reelle_bati?: number | string
  nombre_pieces_principales?: number | string
}

const CSV_HEADERS = [
  'id_mutation',
  'date_mutation',
  'nature_mutation',
  'valeur_fonciere',
  'adresse_numero',
  'adresse_nom_voie',
  'code_commune',
  'nom_commune',
  'code_departement',
  'type_local',
  'surface_reelle_bati',
  'nombre_pieces_principales',
].join(';')

function buildCsv(rows: CsvRow[]): string {
  const lines = rows.map((r) =>
    [
      r.id_mutation,
      r.date_mutation,
      r.nature_mutation,
      String(r.valeur_fonciere ?? '').replace('.', ','),
      r.adresse_numero ?? '',
      r.adresse_nom_voie ?? '',
      r.code_commune ?? '',
      r.nom_commune ?? '',
      r.code_departement ?? '',
      r.type_local ?? '',
      r.surface_reelle_bati !== undefined ? String(r.surface_reelle_bati).replace('.', ',') : '',
      r.nombre_pieces_principales !== undefined ? String(r.nombre_pieces_principales) : '',
    ].join(';'),
  )
  return [CSV_HEADERS, ...lines].join('\n')
}

describe('getDvfByAddress', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('@/lib/observability/logger')
  })

  async function setup(rows: CsvRow[]) {
    const csvText = buildCsv(rows)
    vi.doMock('@/lib/observability/logger', () => ({
      timedFetch: async () =>
        ({
          ok: true,
          status: 200,
          text: async () => csvText,
        }) as unknown as Response,
    }))
    return await import('../dvf')
  }

  it('returns high-confidence match when numero + voie exact', async () => {
    const { getDvfByAddress } = await setup([
      {
        id_mutation: '1',
        date_mutation: '2024-01-15',
        nature_mutation: 'Vente',
        valeur_fonciere: 850000,
        adresse_numero: '12',
        adresse_nom_voie: 'rue de la République',
        code_commune: '69123',
        nom_commune: 'Lyon',
        code_departement: '69',
        type_local: 'Appartement',
        surface_reelle_bati: 95,
      },
    ])
    const out = await getDvfByAddress({
      codeCommune: '69123',
      adresseVoie: 'rue de la République',
      adresseNumero: '12',
    })
    expect(out).toHaveLength(1)
    expect(out[0].match_confidence).toBe('high')
    expect(out[0].valeur_fonciere).toBe(850000)
  })

  it('downgrades to medium when voie matches but numero differs', async () => {
    const { getDvfByAddress } = await setup([
      {
        id_mutation: '1',
        date_mutation: '2024-01-15',
        nature_mutation: 'Vente',
        valeur_fonciere: 850000,
        adresse_numero: '14',
        adresse_nom_voie: 'rue de la République',
        code_commune: '69123',
        nom_commune: 'Lyon',
        code_departement: '69',
        type_local: 'Appartement',
      },
    ])
    const out = await getDvfByAddress({
      codeCommune: '69123',
      adresseVoie: 'rue de la République',
      adresseNumero: '12',
    })
    expect(out).toHaveLength(1)
    expect(out[0].match_confidence).toBe('medium')
  })

  it('drops records with no voie overlap', async () => {
    const { getDvfByAddress } = await setup([
      {
        id_mutation: '1',
        date_mutation: '2024-01-15',
        nature_mutation: 'Vente',
        valeur_fonciere: 850000,
        adresse_numero: '12',
        adresse_nom_voie: 'rue du Bourg',
        code_commune: '69123',
        nom_commune: 'Lyon',
        code_departement: '69',
      },
    ])
    const out = await getDvfByAddress({
      codeCommune: '69123',
      adresseVoie: 'rue de la République',
      adresseNumero: '12',
    })
    expect(out).toHaveLength(0)
  })

  it('respects minConfidence filter', async () => {
    const { getDvfByAddress } = await setup([
      {
        id_mutation: '1',
        date_mutation: '2024-01-15',
        nature_mutation: 'Vente',
        valeur_fonciere: 850000,
        adresse_numero: '14',
        adresse_nom_voie: 'rue de la République',
        code_commune: '69123',
        nom_commune: 'Lyon',
        code_departement: '69',
      },
    ])
    const out = await getDvfByAddress({
      codeCommune: '69123',
      adresseVoie: 'rue de la République',
      adresseNumero: '12',
      minConfidence: 'high',
    })
    expect(out).toHaveLength(0)
  })

  it('sorts by confidence then date desc', async () => {
    const { getDvfByAddress } = await setup([
      {
        id_mutation: '1',
        date_mutation: '2020-01-01',
        nature_mutation: 'Vente',
        valeur_fonciere: 100000,
        adresse_numero: '14',
        adresse_nom_voie: 'rue de la République',
        code_commune: '69123',
        nom_commune: 'Lyon',
        code_departement: '69',
      },
      {
        id_mutation: '2',
        date_mutation: '2024-01-01',
        nature_mutation: 'Vente',
        valeur_fonciere: 200000,
        adresse_numero: '12',
        adresse_nom_voie: 'rue de la République',
        code_commune: '69123',
        nom_commune: 'Lyon',
        code_departement: '69',
      },
      {
        id_mutation: '3',
        date_mutation: '2023-06-01',
        nature_mutation: 'Vente',
        valeur_fonciere: 300000,
        adresse_numero: '13',
        adresse_nom_voie: 'rue de la République',
        code_commune: '69123',
        nom_commune: 'Lyon',
        code_departement: '69',
      },
    ])
    const out = await getDvfByAddress({
      codeCommune: '69123',
      adresseVoie: 'rue de la République',
      adresseNumero: '12',
    })
    // high comes first (numero 12), then medium ordered by date desc (2023 → 2020)
    expect(out.map((c) => c.match_confidence)).toEqual(['high', 'medium', 'medium'])
    expect(out[1].date_mutation).toBe('2023-06-01')
  })

  it('handles diacritics and articles in voie matching', async () => {
    const { getDvfByAddress } = await setup([
      {
        id_mutation: '1',
        date_mutation: '2024-01-15',
        nature_mutation: 'Vente',
        valeur_fonciere: 850000,
        adresse_numero: '12',
        adresse_nom_voie: 'Rue de la Republique', // sans accent dans DVF
        code_commune: '69123',
        nom_commune: 'Lyon',
        code_departement: '69',
      },
    ])
    const out = await getDvfByAddress({
      codeCommune: '69123',
      adresseVoie: 'rue de la République',
      adresseNumero: '12',
    })
    expect(out).toHaveLength(1)
    expect(out[0].match_confidence).toBe('high')
  })

  it('returns empty array when codeCommune is missing', async () => {
    const { getDvfByAddress } = await setup([])
    const out = await getDvfByAddress({
      codeCommune: '',
      adresseVoie: 'rue de la République',
    })
    expect(out).toEqual([])
  })

  it('returns empty array when adresseVoie is missing', async () => {
    const { getDvfByAddress } = await setup([])
    const out = await getDvfByAddress({ codeCommune: '69123', adresseVoie: '' })
    expect(out).toEqual([])
  })
})
