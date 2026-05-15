import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchProspects } from '@/lib/prospect-search/engine'
import { enrichProspect } from '@/lib/enrichment/enricher'
import { scorePatrimony } from '@/lib/enrichment/patrimony-scorer'
import type { Icp, ParsedIcpCriteria, SearchCandidate, StrictFilters } from '@/lib/types'

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
  const limit = Math.min(typeof body.limit === 'number' ? body.limit : 20, 50)

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

  const rawProspects = await searchProspects(criteria, { limit, strictFilters })
  if (rawProspects.length === 0) {
    return NextResponse.json({ candidates: [] })
  }

  // Check which candidates are already in /suivi so the UI can disable them.
  const linkedinUrls = rawProspects.map((r) => r.linkedin_search_url)
  const { data: existing } = await supabase
    .from('prospection_prospects')
    .select('linkedin_url')
    .eq('org_id', membership.org_id)
    .in('linkedin_url', linkedinUrls)
  const existingSet = new Set((existing ?? []).map((r) => r.linkedin_url))

  // Enrich all candidates in parallel — same pipeline as before, just no insert.
  const enrichResults = await Promise.allSettled(
    rawProspects.map(async (raw) => {
      const enrichmentData = await enrichProspect(raw)
      const scoring = await scorePatrimony(enrichmentData)
      enrichmentData.valeur_entreprise_estimee = scoring.valeur_entreprise_estimee ?? undefined
      enrichmentData.revenus_implicites_estimes = scoring.revenus_implicites_estimes ?? undefined
      enrichmentData.patrimoine_total_estime = scoring.patrimoine_total_estime ?? undefined
      enrichmentData.score_breakdown = scoring.breakdown
      enrichmentData.facteurs_cles = scoring.facteurs_cles
      return { raw, enrichmentData, scoring }
    }),
  )

  const candidates: SearchCandidate[] = []
  for (const result of enrichResults) {
    if (result.status === 'rejected') continue
    const { raw, enrichmentData, scoring } = result.value
    candidates.push({
      uid: raw.uid,
      raw,
      enrichment_data: enrichmentData,
      patrimony_score: scoring.score,
      icp_score: raw.score_initial,
      niveau: scoring.niveau,
      raison_principale: scoring.raison_principale,
      already_in_suivi: existingSet.has(raw.linkedin_search_url),
    })
  }

  // Sort by patrimony_score desc — best leads first.
  candidates.sort((a, b) => b.patrimony_score - a.patrimony_score)

  return NextResponse.json({ candidates })
}
