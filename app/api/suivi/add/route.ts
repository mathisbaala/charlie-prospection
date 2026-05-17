import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { storePersonsToCache } from '@/lib/persons-cache/store'
import { persistPremiumSignals } from '@/lib/enrichment/persist-premium-signals'
import { buildPatrimoineImmo } from '@/lib/enrichment/enricher'
import { getBodaccBySiren, classifyBodaccEvent } from '@/lib/data-sources/bodacc'
import { getPappersEnrichment, getPersonneEntreprises } from '@/lib/data-sources/pappers'
import { analyzePersonalPortfolio } from '@/lib/enrichment/personal-portfolio'
import { scorePatrimony } from '@/lib/enrichment/patrimony-scorer'
import { getActesRneBySiren } from '@/lib/data-sources/inpi-rne-company'
import { getAvantagesSante } from '@/lib/data-sources/transparence-sante'
import { getMentionsPresse } from '@/lib/data-sources/news'
import { getLinkedinProfile } from '@/lib/data-sources/proxycurl'
import { getMarquesDeposees } from '@/lib/data-sources/euipo-marques'
import { getDividendesBalo } from '@/lib/data-sources/balo'
import { getCreditEntreprise } from '@/lib/data-sources/societecom'
import { getDonneesStartup } from '@/lib/data-sources/crunchbase'
import { getParcellesIgn, getProprietésFoncierInnovant } from '@/lib/data-sources/cadastre'
import type { BodaccEvent, PappersPremiumData, SearchCandidate } from '@/lib/types'

export const maxDuration = 300

// Profondeur BODACC à la mise en suivi — vs 10 au /recherche/run.
// Stratégie : breadth au search (50 candidats × 10 events = vue d'ensemble
// rapide), depth au suivi (50 events par société = historique complet à la
// signature). BODACC est gratuit (opendata Etalab), donc on peut pousser.
const BODACC_HISTORY_DEPTH = 50

interface AddBody {
  persona_id: string
  candidates: SearchCandidate[]
}

/**
 * POST /api/suivi/add — persists user-selected candidates into
 * prospection_prospects + backfills 1y of past signals for each via the
 * backfill_signals_for_prospect RPC (added in migration PR 1).
 *
 * Ignores candidates whose linkedin_search_url is already in /suivi for this
 * org (idempotent — safe to retry).
 *
 * Response: { added: [{ prospect_id, name, signals_count }] }
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('prospection_organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 400 })

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const body: AddBody = await request.json().catch(() => ({ persona_id: '', candidates: [] }))
  if (!body.persona_id) {
    return NextResponse.json({ error: 'persona_id requis' }, { status: 400 })
  }
  if (!Array.isArray(body.candidates) || body.candidates.length === 0) {
    return NextResponse.json({ error: 'Aucun candidat' }, { status: 400 })
  }

  // Verify the persona belongs to this org — guard against forged payloads.
  const { data: persona, error: pErr } = await supabase
    .from('prospection_icps')
    .select('id, name')
    .eq('id', body.persona_id)
    .eq('org_id', membership.org_id)
    .maybeSingle()
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
  if (!persona) return NextResponse.json({ error: 'Cible introuvable' }, { status: 404 })

  // Dedupe against existing prospects in /suivi (idempotent retries).
  const linkedinUrls = body.candidates.map((c) => c.raw.linkedin_search_url)
  const { data: existing } = await supabase
    .from('prospection_prospects')
    .select('id, linkedin_url')
    .eq('org_id', membership.org_id)
    .in('linkedin_url', linkedinUrls)
  const existingMap = new Map((existing ?? []).map((r) => [r.linkedin_url, r.id]))

  const added: Array<{ prospect_id: string; name: string; signals_count: number }> = []

  for (const candidate of body.candidates) {
    const url = candidate.raw.linkedin_search_url
    let prospectId = existingMap.get(url) ?? null

    if (!prospectId) {
      // Compose linkedin_data as the legacy /api/prospects/search did, so
      // PipelineDetailPanel renders consistently for both old and new rows.
      const linkedinData = {
        source: candidate.raw.source,
        source_type: candidate.raw.source_type,
        nom: `${candidate.raw.dirigeant_prenom} ${candidate.raw.dirigeant_nom}`.trim(),
        prenom: candidate.raw.dirigeant_prenom,
        nom_de_famille: candidate.raw.dirigeant_nom,
        titre: candidate.raw.dirigeant_qualite,
        entreprise: candidate.raw.entreprise_nom,
        ville: candidate.raw.ville,
        linkedin_search_url: url,
        niveau_patrimonial: candidate.niveau,
        raison_score: candidate.raison_principale,
      }

      const { data: inserted, error: insErr } = await supabase
        .from('prospection_prospects')
        .insert({
          org_id: membership.org_id,
          icp_id: body.persona_id,
          linkedin_url: url,
          linkedin_data: linkedinData,
          enrichment_data: candidate.enrichment_data,
          patrimony_score: candidate.patrimony_score,
          icp_score: candidate.icp_score,
          // Land at 'to_contact' rather than 'new': by adding to /suivi the
          // user has signalled intent (it's no longer "just found").
          crm_stage: 'to_contact',
        })
        .select('id')
        .single()

      if (insErr || !inserted) {
        // Skip this candidate but keep going for the others.
        console.error('[suivi/add] insert failed for', url, insErr?.message)
        continue
      }
      prospectId = inserted.id
    }

    // Copie mutable — upgrade enrichit avant le calcul des SIRENs pour que
    // portfolioSirens inclue les SCIs/holdings du dirigeant.
    const currentEnrichment = { ...candidate.enrichment_data }
    const principalSiren = (currentEnrichment?.siren ?? candidate.raw.siren) || null

    // Upgrade vers enrichissement profond — Pappers Premium + portfolio dirigeant.
    // Doit précéder allSirens : sans portfolio, deep BODACC ne couvre que la société principale.
    if (prospectId && principalSiren && candidate.raw.dirigeant_nom) {
      try {
        const [premiumResult, portfolioResult] = await Promise.allSettled([
          getPappersEnrichment(principalSiren, { premium: true }),
          candidate.raw.dirigeant_prenom
            ? getPersonneEntreprises(candidate.raw.dirigeant_prenom, candidate.raw.dirigeant_nom)
            : Promise.resolve(null),
        ])

        if (premiumResult.status === 'fulfilled' && premiumResult.value?.premium) {
          currentEnrichment.pappers_premium = premiumResult.value.premium
          currentEnrichment.sources_utilisees = [
            ...(currentEnrichment.sources_utilisees ?? []),
            'pappers_premium',
          ]
        }

        if (portfolioResult.status === 'fulfilled' && portfolioResult.value) {
          const portfolio = analyzePersonalPortfolio(
            portfolioResult.value.entreprises,
            principalSiren,
          )
          if (portfolio.total_entites > 0) {
            currentEnrichment.personal_portfolio = portfolio
            currentEnrichment.sources_utilisees = [
              ...(currentEnrichment.sources_utilisees ?? []),
              'pappers_dirigeant',
            ]
          }
        }

        const upgradeScoring = await scorePatrimony(currentEnrichment)
        currentEnrichment.valeur_entreprise_estimee =
          upgradeScoring.valeur_entreprise_estimee ?? undefined
        currentEnrichment.patrimoine_total_estime =
          upgradeScoring.patrimoine_total_estime ?? undefined
        currentEnrichment.score_breakdown = upgradeScoring.breakdown

        await supabase
          .from('prospection_prospects')
          .update({
            enrichment_data: currentEnrichment,
            patrimony_score: upgradeScoring.score,
          })
          .eq('id', prospectId)

        // Fire-and-forget : upgrade Premium+portfolio → cache global.
        // C'est l'enrichissement le plus riche du système : toutes les orgs
        // bénéficieront de cette donnée lors de leur prochaine recherche.
        storePersonsToCache(serviceSupabase, [{
          raw: candidate.raw,
          enrichment: currentEnrichment,
          patrimonyScore: upgradeScoring.score,
          raisonPrincipale: upgradeScoring.raison_principale ?? null,
        }]).catch((err) => console.error('[suivi/add] cache store error:', err))
      } catch (e) {
        console.error('[suivi/add] upgrade enrichissement failed:', e)
        // Best-effort — l'enrichissement standard reste valide
      }
    }

    // allSirens calculé après upgrade pour inclure les SCIs/holdings du portfolio.
    // Principe directeur : un prospect = une personne, ses sociétés sont des leviers
    // patrimoniaux. Une cession sur la SCI du dirigeant est un signal sur la
    // personne, pas sur l'entreprise.
    const portfolioSirens =
      currentEnrichment?.personal_portfolio?.entites
        ?.map((e) => e.siren)
        .filter((s): s is string => typeof s === 'string' && s.length >= 9) ?? []
    // Dédup : la principale est aussi dans le portfolio comme 'principale'
    const allSirens = Array.from(
      new Set([principalSiren, ...portfolioSirens].filter((s): s is string => !!s)),
    )

    let signalsCount = 0
    if (allSirens.length > 0 && prospectId) {
      const { data: count, error: rpcErr } = await supabase.rpc(
        'backfill_signals_for_prospect_v2',
        {
          p_prospect_id: prospectId,
          p_org_id: membership.org_id,
          p_sirens: allSirens,
        },
      )
      if (!rpcErr && typeof count === 'number') signalsCount = count
    }

    // Mine signals from the Premium payload (depots_actes + comptes + publications_bodacc)
    // now present in currentEnrichment after the upgrade block. Idempotent : the unique index
    // uq_prospection_signals_prospect_dedup catches duplicates if we re-add
    // a candidate or run this for a row that was already mined.
    const premium = currentEnrichment?.pappers_premium as PappersPremiumData | undefined
    if (premium && prospectId) {
      const { inserted } = await persistPremiumSignals(
        supabase,
        prospectId,
        membership.org_id,
        premium,
      )
      signalsCount += inserted
    }

    // Deep BODACC fetch — on /recherche/run l'enricher prend 10 événements
    // (vue d'ensemble), à la mise en suivi on creuse à 50 par société du
    // dirigeant. Coût: zéro Pappers (BODACC = opendata gratuite). Merge avec
    // l'existant en dédupant par id. Persiste dans enrichment_data pour
    // affichage immédiat dans l'onglet Fiche.
    if (allSirens.length > 0 && prospectId) {
      try {
        const bodaccPerSiren = await Promise.allSettled(
          allSirens.map((s) => getBodaccBySiren(s, BODACC_HISTORY_DEPTH)),
        )
        const fetchedEvents: BodaccEvent[] = []
        for (const res of bodaccPerSiren) {
          if (res.status !== 'fulfilled') continue
          for (const r of res.value) {
            fetchedEvents.push({
              id: r.id,
              date: r.dateparution,
              type: classifyBodaccEvent(r),
              libelle: r.typeavis_lib ?? r.familleavis_lib ?? 'Annonce légale',
              source: 'bodacc',
            })
          }
        }
        if (fetchedEvents.length > 0) {
          // Merge avec ce que l'enricher a déjà mis (10 events max). Dédup par id.
          const existing = (currentEnrichment?.bodacc_events ?? []) as BodaccEvent[]
          const byId = new Map<string, BodaccEvent>()
          for (const e of [...existing, ...fetchedEvents]) byId.set(e.id, e)
          const merged = Array.from(byId.values()).sort((a, b) =>
            b.date.localeCompare(a.date),
          )
          const newEnrichment = {
            ...currentEnrichment,
            bodacc_events: merged,
          }
          // Tag observabilité : on track que le deep-fetch a tourné, utile
          // pour audit "pourquoi cette fiche a 50 events au lieu de 10".
          if (!newEnrichment.sources_utilisees?.includes('bodacc_deep')) {
            newEnrichment.sources_utilisees = [
              ...(newEnrichment.sources_utilisees ?? []),
              'bodacc_deep',
            ]
          }
          await supabase
            .from('prospection_prospects')
            .update({ enrichment_data: newEnrichment })
            .eq('id', prospectId)
        }
      } catch (e) {
        // Best-effort — un échec BODACC ne bloque pas l'ajout au suivi.
        console.error('[suivi/add] deep BODACC fetch failed', e)
      }
    }

    // Depth enrichment — Cerema DV3F (suivi only)
    // Construit le patrimoine immobilier du dirigeant à partir de son
    // portefeuille de sociétés. Toujours après le deep-BODACC pour que
    // l'enrichment_data stockée contienne déjà bodacc_deep.
    const existingPortfolio = currentEnrichment?.personal_portfolio
    if (existingPortfolio && prospectId) {
      try {
        const patrimoineImmo = await buildPatrimoineImmo(existingPortfolio, principalSiren ?? undefined)
        if (patrimoineImmo) {
          // Re-fetch the latest enrichment_data from DB to pick up any BODACC
          // changes written just above, then merge patrimoine_immo into it.
          const { data: freshRow } = await supabase
            .from('prospection_prospects')
            .select('enrichment_data')
            .eq('id', prospectId)
            .single()
          const freshEnrichment = freshRow?.enrichment_data ?? currentEnrichment
          const updatedEnrichment = { ...freshEnrichment, patrimoine_immo: patrimoineImmo }
          await supabase
            .from('prospection_prospects')
            .update({ enrichment_data: updatedEnrichment })
            .eq('id', prospectId)
        }
      } catch (e) {
        console.error('[suivi/add] Cerema depth failed:', e)
      }
    }

    // ── Deep enrichment block — toutes les sources supplémentaires ───────────
    // Toutes en best-effort parallèle. Un échec sur une source ne bloque pas
    // les autres. Le bloc dégrade gracieusement si la clé API est absente.
    // Re-fetch depuis la DB pour prendre en compte BODACC deep + Cerema.
    if (prospectId && candidate.raw.dirigeant_nom) {
      try {
        const isHealth =
          candidate.raw.code_naf?.startsWith('86') ||
          candidate.raw.code_naf?.startsWith('75.00')

        const marquesQuery = candidate.raw.entreprise_nom || candidate.raw.dirigeant_nom
        const nom = candidate.raw.dirigeant_nom
        const prenom = candidate.raw.dirigeant_prenom ?? ''
        const entrepriseNom = candidate.raw.entreprise_nom

        const [
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
          // INPI RNE — actes complets sur toutes les sociétés du portfolio
          Promise.all(allSirens.map((s) => getActesRneBySiren(s))).then((r) => r.flat()),
          // Transparence Santé — professions de santé uniquement
          isHealth && prenom
            ? getAvantagesSante(nom, prenom)
            : Promise.resolve([]),
          // Presse économique (NewsAPI — NEWS_API_KEY)
          getMentionsPresse(nom, prenom, entrepriseNom),
          // LinkedIn via Proxycurl (PROXYCURL_API_KEY — URL /in/ réelle uniquement)
          getLinkedinProfile(candidate.raw.linkedin_search_url ?? ''),
          // Marques EUIPO (gratuit) + INPI (INPI_API_TOKEN)
          getMarquesDeposees(marquesQuery),
          // BALO dividendes (PISTE_CLIENT_ID + PISTE_CLIENT_SECRET)
          getDividendesBalo(nom, entrepriseNom),
          // Societe.com — score crédit + incidents paiement (SOCIETECOM_API_KEY)
          principalSiren ? getCreditEntreprise(principalSiren) : Promise.resolve(null),
          // Crunchbase — levées de fonds startup (CRUNCHBASE_API_KEY)
          entrepriseNom ? getDonneesStartup(entrepriseNom) : Promise.resolve(null),
          // Cadastre IGN — parcelles à l'adresse du siège (gratuit)
          candidate.raw.adresse && candidate.raw.code_postal
            ? getParcellesIgn(candidate.raw.adresse, candidate.raw.code_postal)
            : Promise.resolve([]),
          // Foncier Innovant — biens par nom du dirigeant (FONCIER_INNOVANT_API_KEY)
          prenom ? getProprietésFoncierInnovant(nom, prenom) : Promise.resolve([]),
        ])

        const deepPatch: Record<string, unknown> = {}
        const newSources: string[] = []

        if (actesRne.status === 'fulfilled' && actesRne.value.length > 0) {
          deepPatch.actes_rne = actesRne.value
          newSources.push('inpi_rne_actes')
        }
        if (avantagesSante.status === 'fulfilled' && avantagesSante.value.length > 0) {
          deepPatch.avantages_sante = avantagesSante.value
          newSources.push('transparence_sante')
        }
        if (mentionsPresse.status === 'fulfilled' && mentionsPresse.value.length > 0) {
          deepPatch.mentions_presse = mentionsPresse.value
          newSources.push('presse')
        }
        if (linkedinProfile.status === 'fulfilled' && linkedinProfile.value) {
          deepPatch.linkedin_profile = linkedinProfile.value
          newSources.push('proxycurl')
        }
        if (marques.status === 'fulfilled' && marques.value.length > 0) {
          deepPatch.marques_deposees = marques.value
          newSources.push('euipo_marques')
        }
        if (dividendesBalo.status === 'fulfilled' && dividendesBalo.value.length > 0) {
          deepPatch.dividendes_balo = dividendesBalo.value
          newSources.push('balo')
        }
        if (creditEntreprise.status === 'fulfilled' && creditEntreprise.value) {
          deepPatch.credit_entreprise = creditEntreprise.value
          newSources.push('societecom')
        }
        if (donneesStartup.status === 'fulfilled' && donneesStartup.value) {
          deepPatch.donnees_startup = donneesStartup.value
          newSources.push('crunchbase')
        }
        if (parcellesIgn.status === 'fulfilled' && parcellesIgn.value.length > 0) {
          deepPatch.cadastre_parcelles = parcellesIgn.value
          newSources.push('cadastre_ign')
        }
        if (proprietesFoncier.status === 'fulfilled' && proprietesFoncier.value.length > 0) {
          deepPatch.proprietes_foncier = proprietesFoncier.value
          newSources.push('foncier_innovant')
        }

        if (Object.keys(deepPatch).length > 0) {
          const { data: freshRow } = await supabase
            .from('prospection_prospects')
            .select('enrichment_data')
            .eq('id', prospectId)
            .single()
          const base = freshRow?.enrichment_data ?? currentEnrichment
          const merged = {
            ...base,
            ...deepPatch,
            sources_utilisees: [...(base.sources_utilisees ?? []), ...newSources],
          }
          await supabase
            .from('prospection_prospects')
            .update({ enrichment_data: merged })
            .eq('id', prospectId)
        }
      } catch (e) {
        console.error('[suivi/add] deep enrichment block failed:', e)
      }
    }

    const displayName = `${candidate.raw.dirigeant_prenom} ${candidate.raw.dirigeant_nom}`.trim() ||
      candidate.raw.entreprise_nom
    added.push({ prospect_id: prospectId!, name: displayName, signals_count: signalsCount })
  }

  return NextResponse.json({ added })
}
