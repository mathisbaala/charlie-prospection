import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RawProspect } from '@/lib/prospect-search/engine'

// Mock all external data-source modules so enricher runs in isolation.
vi.mock('@/lib/data-sources/bodacc', () => ({
  getBodaccBySiren: vi.fn(),
  classifyBodaccEvent: vi.fn(() => 'cession'),
}))

vi.mock('@/lib/data-sources/pappers', () => ({
  getPappersEnrichment: vi.fn(),
  // Nouveau (PR portefeuille patrimonial) — par défaut, retourne null
  // pour ne pas changer le comportement des tests existants.
  getPersonneEntreprises: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@/lib/data-sources/rpps', () => ({
  searchRpps: vi.fn(),
  pickBestRppsMatch: vi.fn(),
}))

vi.mock('@/lib/data-sources/dvf', () => ({
  getDvfByCommune: vi.fn(),
}))

vi.mock('@/lib/data-sources/doctolib', () => ({
  buildDoctolibSearchUrl: vi.fn(() => 'https://doctolib.fr/search'),
}))

// Stub global fetch (for resolveCodeCommune's geo.api.gouv.fr call). Returns
// a non-Paris/Lyon/Marseille commune resolution so we test the geo fallback path.
const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

import { enrichProspect, computePotentielRpps } from '../enricher'
import { getBodaccBySiren } from '@/lib/data-sources/bodacc'
import { getPappersEnrichment } from '@/lib/data-sources/pappers'
import { searchRpps, pickBestRppsMatch } from '@/lib/data-sources/rpps'
import { getDvfByCommune } from '@/lib/data-sources/dvf'
import type { RppsProfessionnel } from '@/lib/data-sources/rpps'

const RAW: RawProspect = {
  uid: 'uid-1',
  source: 'pappers',
  source_type: 'personne_physique',
  entreprise_nom: 'CABINET MEDICAL DUPONT',
  siren: '123456789',
  code_naf: '86.21Z', // health professional → triggers RPPS
  libelle_naf: 'Activité des médecins généralistes',
  date_creation: '2010-01-15',
  tranche_effectifs: '00',
  adresse: '12 rue de la République',
  code_postal: '69001',
  ville: 'Lyon',
  departement: '69',
  dirigeant_nom: 'Dupont',
  dirigeant_prenom: 'Jean',
  dirigeant_qualite: 'Gérant',
  dirigeant_annee_naissance: 1968,
  linkedin_search_url: 'https://linkedin.com/search?q=Jean+Dupont',
  score_initial: 60,
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: geo.api.gouv.fr returns nothing useful; Lyon takes hardcoded shortcut anyway
  fetchMock.mockResolvedValue({ ok: true, json: async () => [] })
})

describe('enrichProspect — Promise.allSettled resilience', () => {
  it('returns basic enrichment when ALL external sources fail', async () => {
    vi.mocked(getBodaccBySiren).mockRejectedValueOnce(new Error('bodacc down'))
    vi.mocked(getPappersEnrichment).mockRejectedValueOnce(new Error('pappers down'))
    vi.mocked(searchRpps).mockRejectedValueOnce(new Error('rpps down'))
    vi.mocked(getDvfByCommune).mockRejectedValueOnce(new Error('dvf down'))

    const result = await enrichProspect(RAW)

    // Raw identity fields preserved
    expect(result.dirigeant_nom).toBe('Dupont')
    expect(result.siren).toBe('123456789')
    expect(result.code_naf).toBe('86.21Z')
    // External enrichment absent
    expect(result.bodacc_events).toBeUndefined()
    expect(result.finances).toBeUndefined()
    expect(result.rpps).toBeUndefined()
    expect(result.contexte_marche_immo_local).toBeUndefined()
    // RAW est personne_physique, Pappers a échoué → pas de preuve RCS,
    // donc PAS de lien Infogreffe (l'URL renverrait 404 sur infogreffe.fr).
    expect(result.infogreffe).toBeUndefined()
    expect(result.sources_utilisees).toEqual(['pappers'])
  })

  it('emits Infogreffe fallback link for personne_morale when Pappers fails', async () => {
    vi.mocked(getBodaccBySiren).mockRejectedValueOnce(new Error('bodacc down'))
    vi.mocked(getPappersEnrichment).mockRejectedValueOnce(new Error('pappers down'))
    vi.mocked(searchRpps).mockRejectedValueOnce(new Error('rpps down'))
    vi.mocked(getDvfByCommune).mockRejectedValueOnce(new Error('dvf down'))

    const moralProspect: RawProspect = { ...RAW, source_type: 'personne_morale' }
    const result = await enrichProspect(moralProspect)

    expect(result.infogreffe?.url).toBe(
      'https://www.infogreffe.fr/societes/entreprise-societe/123456789',
    )
    expect(result.infogreffe?.is_fallback).toBe(true)
    expect(result.sources_utilisees).toContain('infogreffe_fallback')
  })

  it('emits non-fallback Infogreffe link for personne_physique with RCS evidence', async () => {
    vi.mocked(getBodaccBySiren).mockResolvedValueOnce([])
    vi.mocked(getPappersEnrichment).mockResolvedValueOnce({
      finances: [],
      beneficiaires_effectifs: [],
      procedure_collective_en_cours: false,
      // Preuve RCS explicite — Pappers identifie cette personne_physique comme
      // immatriculée au greffe (cas typique d'un entrepreneur individuel RCS).
      date_immatriculation_rcs: '2015-03-10',
      greffe: 'LYON',
    })
    vi.mocked(searchRpps).mockResolvedValueOnce([])
    vi.mocked(getDvfByCommune).mockResolvedValueOnce([])

    const result = await enrichProspect(RAW) // source_type = personne_physique
    expect(result.infogreffe?.url).toBeDefined()
    expect(result.infogreffe?.is_fallback).toBe(false) // Pappers a livré le RCS
  })

  it('returns coherent partial enrichment when Pappers OK but BODACC fails', async () => {
    vi.mocked(getBodaccBySiren).mockRejectedValueOnce(new Error('bodacc 500'))
    vi.mocked(getPappersEnrichment).mockResolvedValueOnce({
      finances: [
        {
          annee: 2024,
          chiffre_affaires: 850000,
          resultat: 220000,
          fonds_propres: 600000,
          taux_marge_EBITDA: 28,
        },
      ],
      beneficiaires_effectifs: [
        { nom: 'Dupont', prenom: 'Jean', pourcentage_parts: 100 },
      ],
      procedure_collective_en_cours: false,
      capital: 50000,
    })
    vi.mocked(searchRpps).mockResolvedValueOnce([])
    vi.mocked(getDvfByCommune).mockResolvedValueOnce([])

    const result = await enrichProspect(RAW)

    expect(result.chiffre_affaires_dernier).toBe(850000)
    expect(result.fonds_propres_dernier).toBe(600000)
    expect(result.capital_social).toBe(50000)
    expect(result.beneficiaires_effectifs).toHaveLength(1)
    expect(result.bodacc_events).toBeUndefined()
    expect(result.sources_utilisees).toContain('pappers_finances')
    expect(result.sources_utilisees).not.toContain('bodacc')
  })
})

describe('enrichProspect — RPPS routing', () => {
  it('calls RPPS for a health professional (NAF 86.21Z) with a name', async () => {
    vi.mocked(getBodaccBySiren).mockResolvedValueOnce([])
    vi.mocked(getPappersEnrichment).mockResolvedValueOnce(null)
    vi.mocked(getDvfByCommune).mockResolvedValueOnce([])
    const rppsResults: RppsProfessionnel[] = [
      {
        identifiant: 'RPPS-1',
        nomFamille: 'DUPONT',
        prenomUsuel: 'JEAN',
        libelleProfession: 'Médecin',
        exerciceActivite: [
          {
            libelleProfession: 'Médecin',
            libelleSavoirFaire: 'Chirurgie viscérale et digestive',
            libelleMode: 'libéral',
            libelleTypeActiviteLiberale: 'Secteur 2',
          },
        ],
        situationExercice: [
          {
            raisonSociale: 'Cabinet Dupont',
            libelleCommune: 'Lyon',
            codePostal: '69001',
          },
        ],
      },
    ]
    vi.mocked(searchRpps).mockResolvedValueOnce(rppsResults)
    vi.mocked(pickBestRppsMatch).mockReturnValueOnce(rppsResults[0])

    const result = await enrichProspect(RAW)

    expect(searchRpps).toHaveBeenCalledTimes(1)
    expect(result.rpps?.profession).toBe('Médecin')
    expect(result.rpps?.savoir_faire).toBe('Chirurgie viscérale et digestive')
    // Computed factor surfaced for the scorer
    expect(result.potentiel_rpps).toBe('tres_fort')
    expect(result.sources_utilisees).toContain('rpps')
  })

  it('skips RPPS for a non-health profession (NAF outside 86./87./75.00)', async () => {
    vi.mocked(getBodaccBySiren).mockResolvedValueOnce([])
    vi.mocked(getPappersEnrichment).mockResolvedValueOnce(null)
    vi.mocked(getDvfByCommune).mockResolvedValueOnce([])
    vi.mocked(searchRpps).mockResolvedValueOnce([])

    const nonHealth: RawProspect = { ...RAW, code_naf: '70.22Z' }
    const result = await enrichProspect(nonHealth)

    expect(searchRpps).not.toHaveBeenCalled()
    expect(result.rpps).toBeUndefined()
    expect(result.potentiel_rpps).toBeUndefined()
  })
})

describe('enrichProspect — DVF is contexte marché, not personal patrimony', () => {
  it('stores DVF median under contexte_marche_immo_local, never as patrimoine_immo_estime', async () => {
    vi.mocked(getBodaccBySiren).mockResolvedValueOnce([])
    vi.mocked(getPappersEnrichment).mockResolvedValueOnce(null)
    vi.mocked(searchRpps).mockResolvedValueOnce([])
    vi.mocked(getDvfByCommune).mockResolvedValueOnce([
      {
        id_mutation: 'm1',
        date_mutation: '2026-01-01',
        nature_mutation: 'Vente',
        valeur_fonciere: 450000,
        code_commune: '69001',
        nom_commune: 'Lyon',
        code_departement: '69',
        type_local: 'Appartement',
        surface_reelle_bati: 80,
      },
      {
        id_mutation: 'm2',
        date_mutation: '2026-02-01',
        nature_mutation: 'Vente',
        valeur_fonciere: 600000,
        code_commune: '69001',
        nom_commune: 'Lyon',
        code_departement: '69',
        type_local: 'Maison',
        surface_reelle_bati: 120,
      },
      {
        id_mutation: 'm3',
        date_mutation: '2026-03-01',
        nature_mutation: 'Vente',
        valeur_fonciere: 750000,
        code_commune: '69001',
        nom_commune: 'Lyon',
        code_departement: '69',
        type_local: 'Maison',
        surface_reelle_bati: 140,
      },
    ])

    const result = await enrichProspect(RAW)

    expect(result.contexte_marche_immo_local).toBeDefined()
    expect(result.contexte_marche_immo_local?.mediane_zone).toBe(600000)
    expect(result.contexte_marche_immo_local?.nb_transactions_zone).toBe(3)
    expect(result.contexte_marche_immo_local?.ville).toBe('Lyon')

    // The bug we are killing: DVF median must NOT be exposed as personal patrimony
    expect((result as unknown as { patrimoine_immo_estime?: number }).patrimoine_immo_estime)
      .toBeUndefined()
    expect(result.sources_utilisees).toContain('dvf')
  })
})

describe('computePotentielRpps', () => {
  it('returns "faible" for salaried practitioners', () => {
    expect(
      computePotentielRpps({ mode_exercice: 'Salarié', savoir_faire: 'Cardiologie' }),
    ).toBe('faible')
  })

  it('returns "tres_fort" for sector 2 + technical specialty (chirurgie)', () => {
    expect(
      computePotentielRpps({
        mode_exercice: 'libéral',
        type_activite_liberale: 'Secteur 2',
        savoir_faire: 'Chirurgie viscérale',
      }),
    ).toBe('tres_fort')
  })

  it('returns "fort" for sector 1 + technical specialty', () => {
    expect(
      computePotentielRpps({
        mode_exercice: 'libéral',
        type_activite_liberale: 'Secteur 1',
        savoir_faire: 'Cardiologie',
      }),
    ).toBe('fort')
  })

  it('returns "moyen" for sector 1 généraliste', () => {
    expect(
      computePotentielRpps({
        mode_exercice: 'libéral',
        type_activite_liberale: 'Secteur 1',
        savoir_faire: 'Médecine générale',
      }),
    ).toBe('moyen')
  })

  it('returns undefined when rpps data is absent', () => {
    expect(computePotentielRpps(undefined)).toBeUndefined()
  })
})
