import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { searchProspects } from '@/lib/prospect-search/engine'
import {
  aggregateDropReasons,
  assessProspectQuality,
  type QualityAssessment,
} from '@/lib/prospect-search/quality-filter'
import { enrichProspect } from '@/lib/enrichment/enricher'
import { scorePatrimony } from '@/lib/enrichment/patrimony-scorer'
import type { Icp, ParsedIcpCriteria, SearchCandidate, StrictFilters } from '@/lib/types'
import { runDiscovery, inferDiscoveryParams } from '@/lib/discovery'
import type { RawProspect } from '@/lib/prospect-search/engine'
import { buildCacheFilters, queryPersonsCache } from '@/lib/persons-cache/query'
import { storePersonsToCache } from '@/lib/persons-cache/store'
import { getQuotaStatus } from '@/lib/observability/api-quota'

export const maxDuration = 300

/**
 * POST /api/recherche/run — runs a search against the selected persona and
 * returns enriched candidates WITHOUT persisting anything.
 *
 * The user picks which ones to add to /suivi via POST /api/suivi/add. Non-
 * added candidates are dropped (no DB write, no follow-up enrichment).
 *
 * Body: { persona_id: string, limit?: number }
 * Response: { candidates: SearchCandidate[] }
 *
 * Stratégie data : MAX BREADTH ici, MAX DEPTH côté /suivi.
 * Default limit 50. Chaque candidat traverse l'enricher standard (Pappers
 * standard + BODACC + DVF zone + DVF perso + RPPS + annuaires libéraux +
 * Infogreffe). Coût 1 jeton Pappers par candidat → 50 jetons/recherche.
 * Quota mensuel 500 → ~10 recherches pleines par mois.
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

  const body = await request.json().catch(() => ({}))
  const personaId: string | undefined = body?.persona_id
  if (!personaId) {
    return NextResponse.json({ error: 'persona_id requis' }, { status: 400 })
  }
  // Defaut 50 (max breadth), plafond 100. Cf. JSDoc — la breadth est ici, la
  // depth supplémentaire s'ajoute via /suivi/add (backfill + signal mining).
  const limit = Math.min(typeof body.limit === 'number' ? body.limit : 50, 100)

  // Load the persona to get its criteria (we trust the DB, not the client).
  const { data: persona, error: pErr } = await supabase
    .from('prospection_icps')
    .select('*')
    .eq('id', personaId)
    .eq('org_id', membership.org_id)
    .maybeSingle()
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
  if (!persona) return NextResponse.json({ error: 'Cible introuvable' }, { status: 404 })

  const criteria: ParsedIcpCriteria = (persona as Icp).parsed_criteria
  if (!criteria) return NextResponse.json({ error: 'Critères vides' }, { status: 400 })
  const strictFilters: StrictFilters = (persona as Icp).strict_filters ?? {}

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // ── 1. Cache-first lookup ──────────────────────────────────────────────────
  const discoveryParams = inferDiscoveryParams(criteria)
  const nafCodes = [
    ...(discoveryParams.naf_codes ?? []),
    ...(discoveryParams.naf_code ? [discoveryParams.naf_code] : []),
  ]
  const depts = discoveryParams.departement ? [discoveryParams.departement] : []

  const cacheHits = await queryPersonsCache(
    serviceSupabase,
    buildCacheFilters(nafCodes, depts),
    limit
  )

  // Les dropped sont dans cacheHits (pour blocage re-fetch via cachedUids),
  // mais exclus des résultats frais et des stale à re-enrichir.
  const cacheHitsFresh = cacheHits.filter((h) => !h.needsEnrichment && !h.isDropped)
  const cacheHitsStale = cacheHits.filter((h) => h.needsEnrichment && !h.isDropped)
  const cacheGap = limit - cacheHitsFresh.length

  // ── 2. Découverte externe — toujours, même si le cache est plein ───────────
  // La base interne doit grossir à chaque recherche. On cherche toujours à
  // l'extérieur pour trouver de nouveaux prospects ; ceux qu'on ne peut pas
  // enrichir dans ce cycle (au-delà du gap) sont stockés en 'raw' et seront
  // enrichis à la prochaine recherche qui les croise en cache.
  const cachedUids = new Set(cacheHits.map((h) => h.uid))
  let externalRaw: RawProspect[] = []

  const [rawProspects, discoveryRaw] = await Promise.all([
    searchProspects(criteria, { limit, strictFilters }),
    runDiscovery({ ...discoveryParams, limit }),
  ])

  const seenUids = new Set<string>(cachedUids)
  for (const r of [...discoveryRaw, ...rawProspects]) {
    if (!seenUids.has(r.uid)) {
      seenUids.add(r.uid)
      externalRaw.push(r)
    }
  }

  // Partage : on enrichit jusqu'au gap (pour remplir la réponse), le reste
  // entre en cache sans enrichissement immédiat.
  const gapToFill = Math.max(cacheGap, 0)
  const externalForResponse = externalRaw.slice(0, gapToFill)
  const externalForCacheRaw = externalRaw.slice(gapToFill)

  // Stocker immédiatement les découvertes hors-gap en raw (fire-and-forget).
  // Elles seront enrichies à la prochaine recherche où elles apparaissent comme stale.
  if (externalForCacheRaw.length > 0) {
    storePersonsToCache(
      serviceSupabase,
      externalForCacheRaw.map((raw) => ({
        raw,
        enrichment: null,
        patrimonyScore: null,
        raisonPrincipale: null,
      })),
    ).catch((err) => console.error('[recherche/run] cache store raw overflow error:', err))
  }

  const toEnrich: RawProspect[] = [
    ...cacheHitsStale.map((h) => h.raw),
    ...externalForResponse,
  ]

  // Fast path: cache has enough fresh results, no enrichment needed
  if (cacheHitsFresh.length >= limit && toEnrich.length === 0) {
    const existingUrls = cacheHitsFresh.map((h) => h.raw.linkedin_search_url).filter(Boolean)
    const { data: existing } = await supabase
      .from('prospection_prospects')
      .select('linkedin_url')
      .eq('org_id', membership.org_id)
      .in('linkedin_url', existingUrls)
    const existingSet = new Set((existing ?? []).map((r) => r.linkedin_url))

    const candidates: SearchCandidate[] = cacheHitsFresh.map((h) => ({
      uid: h.uid,
      raw: h.raw,
      enrichment_data: h.enrichment_data,
      patrimony_score: h.patrimony_score,
      icp_score: h.raw.score_initial,
      niveau: h.niveau,
      raison_principale: h.raison_principale,
      already_in_suivi:
        !!h.raw.linkedin_search_url && existingSet.has(h.raw.linkedin_search_url),
    }))
    candidates.sort((a, b) => b.patrimony_score - a.patrimony_score)
    const quotaStatusFast = await getQuotaStatus('pappers')
    return NextResponse.json({ candidates, quota_pappers: quotaStatusFast ?? undefined })
  }

  if (cacheHitsFresh.length === 0 && toEnrich.length === 0) {
    const quotaStatusEmpty = await getQuotaStatus('pappers')
    return NextResponse.json({ candidates: [], quota_pappers: quotaStatusEmpty ?? undefined })
  }

  // Check which candidates are already in /suivi so the UI can disable them.
  const allUrls = [
    ...cacheHitsFresh.map((h) => h.raw.linkedin_search_url),
    ...toEnrich.map((r) => r.linkedin_search_url),
  ].filter(Boolean)
  const { data: existing } = await supabase
    .from('prospection_prospects')
    .select('linkedin_url')
    .eq('org_id', membership.org_id)
    .in('linkedin_url', allUrls)
  const existingSet = new Set((existing ?? []).map((r) => r.linkedin_url))

  // Enrich all candidates in parallel, then quality-filter BEFORE scoring.
  // The quality filter drops obvious off-target cases (procédure collective,
  // coquille vide, dormante) — saves ~2 Claude calls per dropped candidate
  // and élimine le bruit que l'utilisateur verrait dans la liste.
  const enrichResults = await Promise.allSettled(
    toEnrich.map(async (raw) => {
      const enrichmentData = await enrichProspect(raw)
      const quality = assessProspectQuality(enrichmentData)
      if (quality.drop) {
        // Skip scoring entirely — dropped candidates aren't shown to the user.
        return { raw, enrichmentData, quality, dropped: true as const }
      }
      const scoring = await scorePatrimony(enrichmentData)
      enrichmentData.valeur_entreprise_estimee = scoring.valeur_entreprise_estimee ?? undefined
      enrichmentData.revenus_implicites_estimes = scoring.revenus_implicites_estimes ?? undefined
      enrichmentData.patrimoine_total_estime = scoring.patrimoine_total_estime ?? undefined
      enrichmentData.score_breakdown = scoring.breakdown
      enrichmentData.facteurs_cles = scoring.facteurs_cles
      return { raw, enrichmentData, scoring, dropped: false as const, quality }
    }),
  )

  // Fire-and-forget: store new/re-enriched persons to cache
  const toStore = enrichResults
    .filter(
      (
        r,
      ): r is PromiseFulfilledResult<{
        raw: RawProspect
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        enrichmentData: any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        scoring: any
        dropped: false
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        quality: any
      }> => r.status === 'fulfilled' && !r.value.dropped,
    )
    .map((r) => ({
      raw: r.value.raw,
      enrichment: r.value.enrichmentData,
      patrimonyScore: r.value.scoring.score as number,
      raisonPrincipale: (r.value.scoring.raison_principale as string) ?? null,
    }))

  storePersonsToCache(serviceSupabase, toStore).catch((err) =>
    console.error('[recherche/run] cache store error:', err)
  )

  // Stocker aussi les prospects droppés (qualité insuffisante) : leur uid en cache
  // bloque le re-fetch externe à la prochaine recherche → évite de repayer
  // l'enrichissement pour les mêmes profils rejetés.
  const toStoreDrop = enrichResults
    .filter(
      (
        r,
      ): r is PromiseFulfilledResult<{
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        raw: RawProspect; enrichmentData: any; quality: any; dropped: true
      }> => r.status === 'fulfilled' && r.value.dropped,
    )
    .map((r) => ({
      raw: r.value.raw,
      enrichment: null,
      patrimonyScore: null,
      raisonPrincipale: null,
      enrichmentLevel: 'dropped' as const,
    }))

  if (toStoreDrop.length > 0) {
    storePersonsToCache(serviceSupabase, toStoreDrop).catch((err) =>
      console.error('[recherche/run] cache store dropped error:', err)
    )
  }

  const candidates: SearchCandidate[] = []
  const droppedAssessments: QualityAssessment[] = []

  // Cache-fresh candidates (already enriched, just format them)
  for (const h of cacheHitsFresh) {
    candidates.push({
      uid: h.uid,
      raw: h.raw,
      enrichment_data: h.enrichment_data,
      patrimony_score: h.patrimony_score,
      icp_score: h.raw.score_initial,
      niveau: h.niveau,
      raison_principale: h.raison_principale,
      already_in_suivi: !!h.raw.linkedin_search_url && existingSet.has(h.raw.linkedin_search_url),
    })
  }

  // Newly enriched (external + stale re-enriched)
  for (const result of enrichResults) {
    if (result.status === 'rejected') continue
    if (result.value.dropped) {
      droppedAssessments.push(result.value.quality)
      continue
    }
    const { raw, enrichmentData, scoring } = result.value
    candidates.push({
      uid: raw.uid,
      raw,
      enrichment_data: enrichmentData,
      patrimony_score: scoring.score,
      icp_score: raw.score_initial,
      niveau: scoring.niveau,
      raison_principale: scoring.raison_principale,
      already_in_suivi: !!raw.linkedin_search_url && existingSet.has(raw.linkedin_search_url),
    })
  }

  // Sort by patrimony_score desc — best leads first.
  candidates.sort((a, b) => b.patrimony_score - a.patrimony_score)
  const capped = candidates.slice(0, limit)

  const quotaStatus = await getQuotaStatus('pappers')

  return NextResponse.json({
    candidates: capped,
    filtered_count: droppedAssessments.length,
    filter_breakdown: aggregateDropReasons(droppedAssessments),
    quota_pappers: quotaStatus ?? undefined,
  })
}
