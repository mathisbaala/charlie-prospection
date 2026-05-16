import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { persistPremiumSignals } from '@/lib/enrichment/persist-premium-signals'
import { buildPatrimoineImmo } from '@/lib/enrichment/enricher'
import { getBodaccBySiren, classifyBodaccEvent } from '@/lib/data-sources/bodacc'
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

    // Backfill 1y de signaux pour TOUTES les sociétés de la personne — principale
    // ET portfolio (SCI, holdings, autres sociétés du dirigeant). Principe
    // directeur : un prospect = une personne, ses sociétés sont des leviers
    // patrimoniaux. Une cession sur la SCI du dirigeant est un signal sur la
    // personne, pas sur l'entreprise.
    const principalSiren = candidate.enrichment_data?.siren
    const portfolioSirens =
      candidate.enrichment_data?.personal_portfolio?.entites
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
    // already persisted on enrichment_data. Idempotent : the unique index
    // uq_prospection_signals_prospect_dedup catches duplicates if we re-add
    // a candidate or run this for a row that was already mined.
    const premium = candidate.enrichment_data?.pappers_premium as PappersPremiumData | undefined
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
          const existing = (candidate.enrichment_data?.bodacc_events ?? []) as BodaccEvent[]
          const byId = new Map<string, BodaccEvent>()
          for (const e of [...existing, ...fetchedEvents]) byId.set(e.id, e)
          const merged = Array.from(byId.values()).sort((a, b) =>
            b.date.localeCompare(a.date),
          )
          const newEnrichment = {
            ...candidate.enrichment_data,
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
    const existingPortfolio = candidate.enrichment_data?.personal_portfolio
    if (existingPortfolio && prospectId) {
      try {
        const patrimoineImmo = await buildPatrimoineImmo(existingPortfolio, principalSiren)
        if (patrimoineImmo) {
          // Re-fetch the latest enrichment_data from DB to pick up any BODACC
          // changes written just above, then merge patrimoine_immo into it.
          const { data: freshRow } = await supabase
            .from('prospection_prospects')
            .select('enrichment_data')
            .eq('id', prospectId)
            .single()
          const freshEnrichment = freshRow?.enrichment_data ?? candidate.enrichment_data
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

    const displayName = `${candidate.raw.dirigeant_prenom} ${candidate.raw.dirigeant_nom}`.trim() ||
      candidate.raw.entreprise_nom
    added.push({ prospect_id: prospectId!, name: displayName, signals_count: signalsCount })
  }

  return NextResponse.json({ added })
}
