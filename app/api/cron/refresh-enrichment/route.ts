import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { enrichProspect, buildPatrimoineImmo } from '@/lib/enrichment/enricher'
import { scorePatrimony } from '@/lib/enrichment/patrimony-scorer'
import { persistPremiumSignals } from '@/lib/enrichment/persist-premium-signals'
import { getPappersEnrichment, getPersonneEntreprises } from '@/lib/data-sources/pappers'
import { analyzePersonalPortfolio } from '@/lib/enrichment/personal-portfolio'
import { getBodaccBySiren, classifyBodaccEvent } from '@/lib/data-sources/bodacc'
import { getActesRneBySiren } from '@/lib/data-sources/inpi-rne-company'
import { getAvantagesSante } from '@/lib/data-sources/transparence-sante'
import { getMentionsPresse } from '@/lib/data-sources/news'
import { getLinkedinProfile } from '@/lib/data-sources/proxycurl'
import { getMarquesDeposees } from '@/lib/data-sources/euipo-marques'
import { getDividendesBalo } from '@/lib/data-sources/balo'
import { getCreditEntreprise } from '@/lib/data-sources/societecom'
import { getDonneesStartup } from '@/lib/data-sources/crunchbase'
import { getParcellesIgn, getProprietésFoncierInnovant } from '@/lib/data-sources/cadastre'
import { updatePersonEnrichment } from '@/lib/persons/store'
import { canonicalPersonKey } from '@/lib/prospect-search/engine'
import type { RawProspect } from '@/lib/prospect-search/engine'
import type { BodaccEvent, ProspectEnrichmentData } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Cadence cible : 2× par mois (1er et 15), 20 prospects par run.
// À ~12s par prospect (Pappers + 12 sources deep en parallèle + Claude scorer),
// 20 prospects = ~240s — dans le budget maxDuration=300s.
// Au plan Pappers 500 jetons/mois, ~60 jetons/mois pour 30 prospects (=2 runs × 15
// prosps actifs en moyenne).
const BATCH_SIZE = 20

// Une fiche dont l'enrichissement date de moins de 14 jours est "fraîche
// suffisamment" — on évite de re-payer Pappers pour des données qui ne
// bougent pas chaque semaine en pratique (BODACC quotidien, oui ; finances
// annuelles, non). Combiné à la cadence 2×/mois, chaque prospect /suivi
// se fait refresh une fois toutes les 2 semaines en rotation.
const REFRESH_AFTER_DAYS = 14

// Profondeur BODACC au refresh — identique à suivi/add.
const BODACC_HISTORY_DEPTH = 50

function unauthorized() {
  return new NextResponse('Unauthorized', { status: 401 })
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

interface ProspectRow {
  id: string
  org_id: string
  linkedin_data: Record<string, unknown> | null
  enrichment_data: ProspectEnrichmentData & Record<string, unknown>
}

/**
 * Reconstruct a RawProspect from a stored prospection_prospects row.
 * The enricher accepts a RawProspect and re-fetches all sources, so we
 * synthesize one from the persisted identity fields.
 */
function rebuildRaw(p: ProspectRow): RawProspect | null {
  const ed = p.enrichment_data
  const ld = (p.linkedin_data ?? {}) as Record<string, string>
  const siren = ed?.siren
  const prenom = ed?.dirigeant_prenom ?? ld.prenom ?? ''
  const nom = ed?.dirigeant_nom ?? ld.nom_de_famille ?? ''
  if (!siren || !prenom || !nom) return null

  return {
    uid: canonicalPersonKey(prenom, nom, siren),
    source: (ld.source as 'pappers' | 'annuaire_entreprises') ?? 'pappers',
    source_type:
      (ld.source_type as 'personne_morale' | 'personne_physique') ?? 'personne_morale',
    entreprise_nom: (ld.entreprise as string) ?? ed?.libelle_naf ?? '',
    siren,
    code_naf: ed?.code_naf ?? '',
    libelle_naf: ed?.libelle_naf ?? '',
    date_creation: ed?.date_creation_entreprise ?? '',
    tranche_effectifs: ed?.tranche_effectifs ?? '',
    adresse: ed?.adresse_entreprise ?? '',
    code_postal: ed?.code_postal ?? '',
    ville: ed?.ville ?? '',
    departement: ed?.departement ?? '',
    dirigeant_nom: nom,
    dirigeant_prenom: prenom,
    dirigeant_qualite: ed?.dirigeant_qualite ?? '',
    dirigeant_annee_naissance: ed?.dirigeant_annee_naissance,
    linkedin_search_url: (ld.linkedin_search_url as string) ?? '',
    score_initial: 0,
  }
}

async function runRefresh(): Promise<{
  candidates: number
  refreshed: number
  skipped_invalid: number
  failed: number
}> {
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const staleMs = Date.now() - REFRESH_AFTER_DAYS * 24 * 60 * 60 * 1000
  const staleBefore = new Date(staleMs).toISOString()

  const { data: prospects, error } = await supabase
    .from('prospection_prospects')
    .select('id, org_id, linkedin_data, enrichment_data')
    .not('icp_id', 'is', null)
    .or(`enrichment_data->>enrichi_le.is.null,enrichment_data->>enrichi_le.lt.${staleBefore}`)
    .order('enrichment_data->>enrichi_le', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE)

  if (error) throw new Error(`fetching prospects: ${error.message}`)
  if (!prospects || prospects.length === 0) {
    return { candidates: 0, refreshed: 0, skipped_invalid: 0, failed: 0 }
  }

  let refreshed = 0
  let skippedInvalid = 0
  let failed = 0

  for (const p of prospects as ProspectRow[]) {
    const raw = rebuildRaw(p)
    if (!raw) {
      skippedInvalid += 1
      continue
    }
    try {
      // ── Étape 1 : enrichissement de base (11 sources gratuites) ──────────
      const fresh = await enrichProspect(raw)

      // ── Étape 2 : Pappers Premium + portfolio dirigeant ──────────────────
      let allSirens: string[] = raw.siren ? [raw.siren] : []

      if (raw.siren && raw.dirigeant_nom) {
        const [premiumResult, portfolioResult] = await Promise.allSettled([
          getPappersEnrichment(raw.siren, { premium: true }),
          raw.dirigeant_prenom
            ? getPersonneEntreprises(raw.dirigeant_prenom, raw.dirigeant_nom)
            : Promise.resolve(null),
        ])

        if (premiumResult.status === 'fulfilled' && premiumResult.value?.premium) {
          fresh.pappers_premium = premiumResult.value.premium
          fresh.sources_utilisees = [
            ...(fresh.sources_utilisees ?? []),
            'pappers_premium',
          ]
        }

        if (portfolioResult.status === 'fulfilled' && portfolioResult.value) {
          const portfolio = analyzePersonalPortfolio(
            portfolioResult.value.entreprises,
            raw.siren,
          )
          if (portfolio.total_entites > 0) {
            fresh.personal_portfolio = portfolio
            fresh.sources_utilisees = [
              ...(fresh.sources_utilisees ?? []),
              'pappers_dirigeant',
            ]
          }
        }

        // Recalculer allSirens avec le portfolio — couvre SCI + holdings.
        const portfolioSirens =
          fresh.personal_portfolio?.entites
            ?.map((e) => e.siren)
            .filter((s): s is string => typeof s === 'string' && s.length >= 9) ?? []
        allSirens = Array.from(
          new Set([raw.siren, ...portfolioSirens].filter((s): s is string => !!s)),
        )
      }

      // ── Étape 3 : sources profondes en parallèle ─────────────────────────
      // Miroir exact du bloc deep de /api/suivi/add — exécuté ici au refresh
      // pour que les données ne vieillissent pas entre deux ajouts en suivi.
      const isHealth =
        raw.code_naf?.startsWith('86') || raw.code_naf?.startsWith('75.00')
      const nom = raw.dirigeant_nom
      const prenom = raw.dirigeant_prenom ?? ''
      const entrepriseNom = raw.entreprise_nom
      const marquesQuery = entrepriseNom || nom

      const [
        bodaccDeep,
        patrimoineImmo,
        actesRne,
        avantagesSante,
        mentionsPresse,
        linkedinProfile,
        marques,
        dividendesBalo,
        creditEntreprise,
        donneesStartup,
        parcellesIgn,
        proprietesFoncier,
      ] = await Promise.allSettled([
        // BODACC deep — 50 events × toutes sociétés du portfolio
        allSirens.length > 0
          ? Promise.all(allSirens.map((s) => getBodaccBySiren(s, BODACC_HISTORY_DEPTH))).then((r) => r.flat())
          : Promise.resolve([]),
        // Cerema DVF — patrimoine immobilier du dirigeant
        fresh.personal_portfolio
          ? buildPatrimoineImmo(fresh.personal_portfolio, raw.siren ?? undefined)
          : Promise.resolve(null),
        // INPI RNE — actes complets sur toutes les sociétés du portfolio
        allSirens.length > 0
          ? Promise.all(allSirens.map((s) => getActesRneBySiren(s))).then((r) => r.flat())
          : Promise.resolve([]),
        // Transparence Santé — professions de santé uniquement (gratuit)
        isHealth && prenom
          ? getAvantagesSante(nom, prenom)
          : Promise.resolve([]),
        // Presse économique (NEWS_API_KEY)
        getMentionsPresse(nom, prenom, entrepriseNom),
        // LinkedIn via Proxycurl (PROXYCURL_API_KEY — URL /in/ réelle uniquement)
        getLinkedinProfile(raw.linkedin_search_url ?? ''),
        // Marques EUIPO (gratuit)
        getMarquesDeposees(marquesQuery),
        // BALO dividendes (PISTE_CLIENT_ID + PISTE_CLIENT_SECRET)
        getDividendesBalo(nom, entrepriseNom),
        // Societe.com — score crédit + incidents paiement (SOCIETECOM_API_KEY)
        raw.siren ? getCreditEntreprise(raw.siren) : Promise.resolve(null),
        // Crunchbase — levées de fonds startup (CRUNCHBASE_API_KEY)
        entrepriseNom ? getDonneesStartup(entrepriseNom) : Promise.resolve(null),
        // Cadastre IGN — parcelles à l'adresse du siège (gratuit)
        raw.adresse && raw.code_postal
          ? getParcellesIgn(raw.adresse, raw.code_postal)
          : Promise.resolve([]),
        // Foncier Innovant — biens détenus par le dirigeant (FONCIER_INNOVANT_API_KEY)
        prenom ? getProprietésFoncierInnovant(nom, prenom) : Promise.resolve([]),
      ])

      // ── Merge BODACC deep ────────────────────────────────────────────────
      if (bodaccDeep.status === 'fulfilled' && bodaccDeep.value.length > 0) {
        const fetched: BodaccEvent[] = bodaccDeep.value.map((r) => ({
          id: r.id,
          date: r.dateparution,
          type: classifyBodaccEvent(r),
          libelle: r.typeavis_lib ?? r.familleavis_lib ?? 'Annonce légale',
          source: 'bodacc' as const,
        }))
        const existing = (fresh.bodacc_events ?? []) as BodaccEvent[]
        const byId = new Map<string, BodaccEvent>()
        for (const e of [...existing, ...fetched]) byId.set(e.id, e)
        fresh.bodacc_events = Array.from(byId.values()).sort((a, b) =>
          b.date.localeCompare(a.date),
        )
        if (!fresh.sources_utilisees?.includes('bodacc_deep')) {
          fresh.sources_utilisees = [...(fresh.sources_utilisees ?? []), 'bodacc_deep']
        }
      }

      // ── Merge Cerema patrimoine immo ─────────────────────────────────────
      if (patrimoineImmo.status === 'fulfilled' && patrimoineImmo.value) {
        fresh.patrimoine_immo = patrimoineImmo.value
      }

      // ── Merge deep block ─────────────────────────────────────────────────
      if (actesRne.status === 'fulfilled' && actesRne.value.length > 0) {
        fresh.actes_rne = actesRne.value
        fresh.sources_utilisees = [...(fresh.sources_utilisees ?? []), 'inpi_rne_actes']
      }
      if (avantagesSante.status === 'fulfilled' && avantagesSante.value.length > 0) {
        fresh.avantages_sante = avantagesSante.value
        fresh.sources_utilisees = [...(fresh.sources_utilisees ?? []), 'transparence_sante']
      }
      if (mentionsPresse.status === 'fulfilled' && mentionsPresse.value.length > 0) {
        fresh.mentions_presse = mentionsPresse.value
        fresh.sources_utilisees = [...(fresh.sources_utilisees ?? []), 'presse']
      }
      if (linkedinProfile.status === 'fulfilled' && linkedinProfile.value) {
        fresh.linkedin_profile = linkedinProfile.value
        fresh.sources_utilisees = [...(fresh.sources_utilisees ?? []), 'proxycurl']
      }
      if (marques.status === 'fulfilled' && marques.value.length > 0) {
        fresh.marques_deposees = marques.value
        fresh.sources_utilisees = [...(fresh.sources_utilisees ?? []), 'euipo_marques']
      }
      if (dividendesBalo.status === 'fulfilled' && dividendesBalo.value.length > 0) {
        fresh.dividendes_balo = dividendesBalo.value
        fresh.sources_utilisees = [...(fresh.sources_utilisees ?? []), 'balo']
      }
      if (creditEntreprise.status === 'fulfilled' && creditEntreprise.value) {
        fresh.credit_entreprise = creditEntreprise.value
        fresh.sources_utilisees = [...(fresh.sources_utilisees ?? []), 'societecom']
      }
      if (donneesStartup.status === 'fulfilled' && donneesStartup.value) {
        fresh.donnees_startup = donneesStartup.value
        fresh.sources_utilisees = [...(fresh.sources_utilisees ?? []), 'crunchbase']
      }
      if (parcellesIgn.status === 'fulfilled' && parcellesIgn.value.length > 0) {
        fresh.cadastre_parcelles = parcellesIgn.value
        fresh.sources_utilisees = [...(fresh.sources_utilisees ?? []), 'cadastre_ign']
      }
      if (proprietesFoncier.status === 'fulfilled' && proprietesFoncier.value.length > 0) {
        fresh.proprietes_foncier = proprietesFoncier.value
        fresh.sources_utilisees = [...(fresh.sources_utilisees ?? []), 'foncier_innovant']
      }

      // ── Étape 4 : scoring Claude sur toutes les données consolidées ───────
      const scoring = await scorePatrimony(fresh)
      fresh.valeur_entreprise_estimee = scoring.valeur_entreprise_estimee ?? undefined
      fresh.revenus_implicites_estimes = scoring.revenus_implicites_estimes ?? undefined
      fresh.patrimoine_total_estime = scoring.patrimoine_total_estime ?? undefined
      fresh.score_breakdown = scoring.breakdown
      fresh.facteurs_cles = scoring.facteurs_cles

      // ── Étape 5 : écriture DB unique ─────────────────────────────────────
      const { error: upErr } = await supabase
        .from('prospection_prospects')
        .update({
          enrichment_data: fresh,
          patrimony_score: scoring.score,
        })
        .eq('id', p.id)

      if (upErr) {
        failed += 1
        continue
      }

      // Mine signals depuis le payload Premium — idempotent via unique index.
      if (fresh.pappers_premium) {
        await persistPremiumSignals(supabase, p.id, p.org_id, fresh.pappers_premium)
      }

      // Fire-and-forget : remonte le score deep dans prospection_persons.
      // 'deep' : un prospect en suivi reste deep pour toutes les orgs.
      updatePersonEnrichment(
        supabase,
        canonicalPersonKey(raw.dirigeant_prenom, raw.dirigeant_nom, raw.siren),
        fresh as Record<string, unknown>,
        scoring.score,
        scoring.raison_principale ?? null,
        'deep',
      ).catch((err) => console.error('[refresh-enrichment] persons store error:', err))

      refreshed += 1
    } catch {
      failed += 1
    }
  }

  return { candidates: prospects.length, refreshed, skipped_invalid: skippedInvalid, failed }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized()
  try {
    const result = await runRefresh()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
