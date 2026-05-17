/**
 * End-to-end workflow test: simulates the path
 *   raw prospect → enrichProspect → scorePatrimony → enrichment_data persisted shape
 * with all external IO (data sources + Anthropic SDK) mocked.
 *
 * Verifies the actual integration contract the API route depends on.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RawProspect } from '@/lib/prospect-search/engine'

// ── External data-source mocks ───────────────────────────────────────────
vi.mock('@/lib/data-sources/bodacc', () => ({
  getBodaccBySiren: vi.fn(),
  classifyBodaccEvent: vi.fn(() => 'cession'),
}))
vi.mock('@/lib/data-sources/pappers', () => ({
  getPappersEnrichment: vi.fn(),
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

// ── Anthropic SDK mock ───────────────────────────────────────────────────
// vi.mock is hoisted, so define the spy and class inside the factory and
// expose them via the mocked module rather than via a top-level closure.
vi.mock('@anthropic-ai/sdk', () => {
  const create = vi.fn()
  class FakeAnthropic {
    messages = { create }
  }
  return { default: FakeAnthropic, __create: create }
})
// Pull the spy back out after hoisting.
const { __create: createMessage } = (await import('@anthropic-ai/sdk')) as unknown as {
  __create: ReturnType<typeof vi.fn>
}

// ── Global fetch mock (resolveCodeCommune) ───────────────────────────────
const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

import { enrichProspect } from '../enricher'
import { scorePatrimony } from '../patrimony-scorer'
import { getBodaccBySiren } from '@/lib/data-sources/bodacc'
import { getPappersEnrichment } from '@/lib/data-sources/pappers'
import { searchRpps, pickBestRppsMatch } from '@/lib/data-sources/rpps'
import { getDvfByCommune } from '@/lib/data-sources/dvf'
import type { ProspectEnrichmentData } from '@/lib/types'

const RAW: RawProspect = {
  uid: 'uid-end-to-end',
  source: 'pappers',
  source_type: 'personne_physique',
  entreprise_nom: 'CABINET DR DURAND',
  siren: '987654321',
  code_naf: '86.21Z',
  libelle_naf: 'Médecins généralistes',
  date_creation: '2008-09-01',
  tranche_effectifs: '00',
  adresse: '5 avenue Foch',
  code_postal: '75116',
  ville: 'Paris',
  departement: '75',
  dirigeant_nom: 'Durand',
  dirigeant_prenom: 'Claire',
  dirigeant_qualite: 'Gérant',
  dirigeant_annee_naissance: 1972,
  linkedin_search_url: 'https://linkedin.com/search?q=Claire+Durand',
  score_initial: 78,
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockResolvedValue({ ok: true, json: async () => [] })
})

describe('workflow: enrichProspect → scorePatrimony → enrichment_data shape', () => {
  it('produces an enrichment payload the API route can persist as-is', async () => {
    // ── Mock all data sources with realistic payloads ──
    vi.mocked(getBodaccBySiren).mockResolvedValueOnce([
      {
        id: 'b1',
        dateparution: new Date(Date.now() - 15 * 86_400_000).toISOString().slice(0, 10),
        familleavis_lib: 'Cession',
        typeavis_lib: 'Cession de fonds',
      },
      {
        id: 'b2',
        dateparution: new Date(Date.now() - 200 * 86_400_000).toISOString().slice(0, 10),
        familleavis_lib: 'Modification',
        typeavis_lib: 'Modification',
      },
    ])
    vi.mocked(getPappersEnrichment).mockResolvedValueOnce({
      finances: [
        {
          annee: 2024,
          chiffre_affaires: 1_200_000,
          resultat: 380_000,
          fonds_propres: 950_000,
          taux_marge_EBITDA: 31,
        },
        {
          annee: 2023,
          chiffre_affaires: 1_050_000,
          resultat: 290_000,
          fonds_propres: 720_000,
          taux_marge_EBITDA: 27,
        },
      ],
      beneficiaires_effectifs: [
        { nom: 'Durand', prenom: 'Claire', pourcentage_parts: 100 },
      ],
      procedure_collective_en_cours: false,
      capital: 200_000,
    })
    const rppsHit = {
      identifiant: 'RPPS-42',
      nomFamille: 'DURAND',
      prenomUsuel: 'CLAIRE',
      libelleProfession: 'Médecin',
      exerciceActivite: [
        {
          libelleProfession: 'Médecin',
          libelleSavoirFaire: 'Chirurgie viscérale',
          libelleMode: 'libéral',
          libelleTypeActiviteLiberale: 'Secteur 2',
        },
      ],
      situationExercice: [{ libelleCommune: 'Paris', codePostal: '75116' }],
    }
    vi.mocked(searchRpps).mockResolvedValueOnce([rppsHit])
    vi.mocked(pickBestRppsMatch).mockReturnValueOnce(rppsHit)
    vi.mocked(getDvfByCommune).mockResolvedValueOnce([
      {
        id_mutation: 'd1',
        date_mutation: '2026-03-01',
        nature_mutation: 'Vente',
        valeur_fonciere: 1_800_000,
        code_commune: '75056',
        nom_commune: 'Paris',
        code_departement: '75',
        type_local: 'Appartement',
        surface_reelle_bati: 120,
      },
    ])

    // ── Step 1: enrich ──
    const enriched = await enrichProspect(RAW)

    // The bug we killed: DVF must be contexte, not patrimony
    expect(enriched.contexte_marche_immo_local).toBeDefined()
    expect(
      (enriched as unknown as { patrimoine_immo_estime?: number }).patrimoine_immo_estime,
    ).toBeUndefined()
    // RPPS factor injected
    expect(enriched.potentiel_rpps).toBe('tres_fort')
    // Fresh BODACC signal present
    expect(enriched.bodacc_events).toHaveLength(2)

    // ── Step 2: score (mock Claude) ──
    createMessage.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            score: 86,
            breakdown: {
              patrimoine_professionnel: 88,
              patrimoine_immobilier: 65,
              signaux_liquidite: 92,
              age_carriere: 80,
              qualite_donnees: 95,
            },
            facteurs_cles: [
              'Chirurgienne secteur 2 — revenus typiques > 250k€/an',
              'Cession récente détectée il y a 15 jours',
              'Fonds propres en hausse 720k→950k',
            ],
            patrimoine_total_estime: 3_500_000,
            valeur_entreprise_estimee: 1_800_000,
            revenus_implicites_estimes: 320_000,
            niveau: 'prioritaire',
            raison_principale: 'Profil chirurgien secteur 2 avec signal de cession frais.',
          }),
        },
      ],
    })

    const scoring = await scorePatrimony(enriched)

    // ── Step 3: route.ts mutations (replicated here) ──
    enriched.valeur_entreprise_estimee = scoring.valeur_entreprise_estimee ?? undefined
    enriched.revenus_implicites_estimes = scoring.revenus_implicites_estimes ?? undefined
    enriched.patrimoine_total_estime = scoring.patrimoine_total_estime ?? undefined
    enriched.score_breakdown = scoring.breakdown
    enriched.facteurs_cles = scoring.facteurs_cles

    // ── Step 4: verify the shape the UI receives ──
    const persisted = enriched as ProspectEnrichmentData

    // Score breakdown threaded all the way through
    expect(persisted.score_breakdown).toEqual({
      patrimoine_professionnel: 88,
      patrimoine_immobilier: 65,
      signaux_liquidite: 92,
      age_carriere: 80,
      qualite_donnees: 95,
    })
    expect(persisted.facteurs_cles).toHaveLength(3)
    expect(persisted.facteurs_cles?.[0]).toContain('secteur 2')

    // Cartographie patrimoniale sources surfaced
    expect(persisted.valeur_entreprise_estimee).toBe(1_800_000)
    expect(persisted.patrimoine_total_estime).toBe(3_500_000)
    expect(persisted.revenus_implicites_estimes).toBe(320_000)

    // RPPS injected and DVF context preserved
    expect(persisted.potentiel_rpps).toBe('tres_fort')
    expect(persisted.contexte_marche_immo_local?.mediane_zone).toBe(1_800_000)

    // Scorer used the structured shape
    expect(scoring.score).toBe(86)
    expect(scoring.niveau).toBe('prioritaire')

    // Claude got the prompt with potentiel_rpps as a hard input
    const promptSent = createMessage.mock.calls[0][0].messages[0].content as string
    expect(promptSent).toContain('Potentiel patrimonial RPPS (input dur): **tres_fort**')
    expect(promptSent).toContain('Contexte marché immobilier local')
    expect(promptSent).toContain('NE PAS confondre avec patrimoine perso')
    // Fresh signal weighted higher than the 200-day-old one
    const freshLine = promptSent.match(/\[poids 1\.0\]/)
    const staleLine = promptSent.match(/\[poids 0\.1\]/)
    expect(freshLine).not.toBeNull()
    expect(staleLine).not.toBeNull()
    // Fresh signal listed BEFORE stale signal
    expect(promptSent.indexOf('[poids 1.0]')).toBeLessThan(promptSent.indexOf('[poids 0.1]'))
  })

  it('falls back gracefully when Claude returns malformed JSON', async () => {
    vi.mocked(getBodaccBySiren).mockResolvedValueOnce([])
    vi.mocked(getPappersEnrichment).mockResolvedValueOnce(null)
    vi.mocked(searchRpps).mockResolvedValueOnce([])
    vi.mocked(getDvfByCommune).mockResolvedValueOnce([])

    const enriched = await enrichProspect(RAW)

    createMessage.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'this is not JSON at all' }],
    })

    const scoring = await scorePatrimony(enriched)

    // Graceful fallback shape — no crash, all fields present
    expect(scoring.score).toBe(30)
    expect(scoring.niveau).toBe('moyen')
    expect(scoring.breakdown).toEqual({
      patrimoine_professionnel: 0,
      patrimoine_immobilier: 0,
      signaux_liquidite: 0,
      age_carriere: 0,
      qualite_donnees: 0,
    })
    expect(scoring.facteurs_cles).toEqual([])
  })
})
