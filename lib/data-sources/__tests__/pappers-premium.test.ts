import { describe, it, expect, afterEach, vi } from 'vitest'

// Mock @/lib/observability — testEnv shortcircuit déjà couvert par api-quota.test.ts.
// On veut ici tester que les flags Premium se traduisent par les bons query params
// sur l'URL Pappers, ET que le payload de réponse est correctement remappé en
// `PappersPremiumData`. On mocke timedFetch pour capturer l'URL et fournir
// une réponse contrôlée.

describe('getPappersEnrichment — Premium flag wiring', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.doUnmock('@/lib/observability/logger')
    vi.doUnmock('@/lib/observability/api-quota')
  })

  async function setupMockedFetch(responseBody: Record<string, unknown>) {
    const fetchCalls: string[] = []

    vi.doMock('@/lib/observability/logger', () => ({
      timedFetch: async (_src: string, _op: string, url: string) => {
        fetchCalls.push(url)
        return {
          ok: true,
          status: 200,
          json: async () => responseBody,
        } as unknown as Response
      },
    }))

    // tryConsumeQuota = true pour passer le gate quota dans tous les tests
    vi.doMock('@/lib/observability/api-quota', () => ({
      tryConsumeQuota: async () => true,
    }))

    vi.stubEnv('PAPPERS_API_KEY', 'fake-key-for-test')

    const mod = await import('../pappers')
    return { mod, fetchCalls }
  }

  const standardBody = {
    finances: [{ annee: 2024, chiffre_affaires: 1_000_000 }],
    beneficiaires_effectifs: [],
    procedure_collective_en_cours: false,
    capital: 100_000,
  }

  const premiumBody = {
    ...standardBody,
    depots_actes: [
      {
        date_depot: '2025-09-15',
        nom_fichier_pdf: 'ACME - Actes du 15-09-2025.pdf',
        token: 'tok_actes',
        disponible: true,
        actes: [{ type: 'Cession de parts', date_acte: '2025-09-01' }],
      },
    ],
    comptes: [
      {
        date_depot: '2025-07-10',
        date_cloture: '2024-12-31',
        annee_cloture: 2024,
        type_comptes: 'CS',
        confidentialite: false,
        disponible: true,
        token: 'tok_comptes',
      },
    ],
    publications_bodacc: [
      {
        date: '2025-08-20',
        type: 'Modification',
        denomination: 'ACME',
        capital: 200_000,
        description: 'Augmentation de capital',
      },
    ],
  }

  it('omits Premium query flags when opts.premium is undefined', async () => {
    const { mod, fetchCalls } = await setupMockedFetch(standardBody)
    const out = await mod.getPappersEnrichment('123456789')

    expect(fetchCalls).toHaveLength(1)
    const url = fetchCalls[0]
    expect(url).not.toMatch(/actes_telechargement/)
    expect(url).not.toMatch(/comptes_telechargement/)
    expect(url).not.toMatch(/publications_bodacc_brutes/)
    expect(out?.premium).toBeUndefined()
  })

  it('omits Premium flags when premium=true but PAPPERS_PREMIUM_ENABLED is not set', async () => {
    // Garde-fou : si l'utilisateur active le flag par erreur sans avoir
    // poussé l'env var, on ne doit PAS partir en Premium silencieusement.
    const { mod, fetchCalls } = await setupMockedFetch(standardBody)
    const out = await mod.getPappersEnrichment('123456789', { premium: true })

    const url = fetchCalls[0]
    expect(url).not.toMatch(/actes_telechargement/)
    expect(out?.premium).toBeUndefined()
  })

  it('adds Premium flags when premium=true AND PAPPERS_PREMIUM_ENABLED=1', async () => {
    vi.stubEnv('PAPPERS_PREMIUM_ENABLED', '1')
    const { mod, fetchCalls } = await setupMockedFetch(premiumBody)
    const out = await mod.getPappersEnrichment('123456789', { premium: true })

    const url = fetchCalls[0]
    expect(url).toMatch(/actes_telechargement=true/)
    expect(url).toMatch(/comptes_telechargement=true/)
    expect(url).toMatch(/publications_bodacc_brutes=true/)
    expect(url).toMatch(/format_publications_bodacc=json/)

    // Standard fields toujours présents
    expect(out?.finances).toHaveLength(1)
    expect(out?.capital).toBe(100_000)

    // Premium payload remappé
    expect(out?.premium).toBeDefined()
    expect(out?.premium?.depots_actes).toHaveLength(1)
    expect(out?.premium?.depots_actes[0].actes[0].type).toBe('Cession de parts')
    expect(out?.premium?.comptes).toHaveLength(1)
    expect(out?.premium?.comptes[0].annee_cloture).toBe(2024)
    expect(out?.premium?.publications_bodacc).toHaveLength(1)
    expect(out?.premium?.publications_bodacc[0].denomination).toBe('ACME')
    expect(out?.premium?.cost_jetons).toBe(1)
    expect(out?.premium?.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('coerces missing Premium arrays to empty arrays (defensive)', async () => {
    vi.stubEnv('PAPPERS_PREMIUM_ENABLED', '1')
    // Pappers peut renvoyer des champs manquants ou non-array — ne pas planter.
    const { mod } = await setupMockedFetch({
      ...standardBody,
      depots_actes: null,
      comptes: undefined,
      publications_bodacc: 'oops',
    })
    const out = await mod.getPappersEnrichment('123456789', { premium: true })

    expect(out?.premium?.depots_actes).toEqual([])
    expect(out?.premium?.comptes).toEqual([])
    expect(out?.premium?.publications_bodacc).toEqual([])
  })
})

