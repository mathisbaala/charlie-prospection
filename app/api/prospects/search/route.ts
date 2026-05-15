import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchProspects } from '@/lib/prospect-search/engine'
import { enrichProspect } from '@/lib/enrichment/enricher'
import { scorePatrimony } from '@/lib/enrichment/patrimony-scorer'
import type { ParsedIcpCriteria, ProspectEnrichmentData } from '@/lib/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('prospection_organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 400 })

  const body = await request.json()
  const criteria: ParsedIcpCriteria = body.criteria
  const icpId: string | null = body.icp_id ?? null
  if (!criteria) return NextResponse.json({ error: 'criteria required' }, { status: 400 })

  const limit = Math.min(body.limit ?? 20, 50)

  const rawProspects = await searchProspects(criteria, { limit })
  if (rawProspects.length === 0) return NextResponse.json({ count: 0, prospect_ids: [] })

  // Batch-check which prospects already exist (single query)
  const linkedinUrls = rawProspects.map(r => r.linkedin_search_url)
  const { data: existingRows } = await supabase
    .from('prospection_prospects')
    .select('id, linkedin_url')
    .eq('org_id', membership.org_id)
    .in('linkedin_url', linkedinUrls)

  const existingByUrl = new Map((existingRows ?? []).map(r => [r.linkedin_url, r.id]))
  const saved: string[] = [...existingByUrl.values()]
  const newRaws = rawProspects.filter(r => !existingByUrl.has(r.linkedin_search_url))

  // Enrich all new prospects in parallel
  const enrichResults = await Promise.allSettled(
    newRaws.map(async (raw) => {
      const enrichmentData = await enrichProspect(raw)
      const scoring = await scorePatrimony(enrichmentData)
      return { raw, enrichmentData, scoring }
    })
  )

  // Insert each successfully enriched prospect sequentially (signals depend on prospect id)
  for (const result of enrichResults) {
    if (result.status === 'rejected') continue
    const { raw, enrichmentData, scoring } = result.value

    enrichmentData.valeur_entreprise_estimee = scoring.valeur_entreprise_estimee ?? undefined
    enrichmentData.revenus_implicites_estimes = scoring.revenus_implicites_estimes ?? undefined
    enrichmentData.patrimoine_total_estime = scoring.patrimoine_total_estime ?? undefined
    enrichmentData.score_breakdown = scoring.breakdown
    enrichmentData.facteurs_cles = scoring.facteurs_cles

    const linkedinData = {
      source: raw.source,
      source_type: raw.source_type,
      nom: `${raw.dirigeant_prenom} ${raw.dirigeant_nom}`,
      prenom: raw.dirigeant_prenom,
      nom_de_famille: raw.dirigeant_nom,
      titre: raw.dirigeant_qualite,
      entreprise: raw.entreprise_nom,
      ville: raw.ville,
      linkedin_search_url: raw.linkedin_search_url,
      niveau_patrimonial: scoring.niveau,
      raison_score: scoring.raison_principale,
    }

    const { data: prospect, error } = await supabase
      .from('prospection_prospects')
      .insert({
        org_id: membership.org_id,
        icp_id: icpId,
        linkedin_url: raw.linkedin_search_url,
        linkedin_data: linkedinData,
        enrichment_data: enrichmentData,
        patrimony_score: scoring.score,
        icp_score: raw.score_initial,
        crm_stage: 'new',
        last_signal_at: enrichmentData.bodacc_events?.[0]?.date
          ? new Date(enrichmentData.bodacc_events[0].date).toISOString()
          : null,
      })
      .select('id')
      .single()

    if (!error && prospect) {
      saved.push(prospect.id)
      await insertSignals(supabase, prospect.id, membership.org_id, enrichmentData)
    }
  }

  return NextResponse.json({ count: saved.length, prospect_ids: saved })
}

async function insertSignals(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  prospectId: string,
  orgId: string,
  enrichmentData: ProspectEnrichmentData
) {
  if (!enrichmentData.bodacc_events?.length) return
  const signalInserts = enrichmentData.bodacc_events
    .filter(e => e.type !== 'autre')
    .map(e => ({
      prospect_id: prospectId,
      org_id: orgId,
      type: mapBodaccToSignalType(e.type),
      source: 'bodacc' as const,
      data: { libelle: e.libelle, date_bodacc: e.date },
      detected_at: new Date(e.date).toISOString(),
    }))
  if (signalInserts.length > 0) {
    await supabase.from('prospection_signals').insert(signalInserts)
  }
}

function mapBodaccToSignalType(type: string): string {
  const map: Record<string, string> = {
    cession: 'cession_entreprise',
    creation: 'nouveau_poste',
    radiation: 'cession_entreprise',
    procedure_collective: 'cession_entreprise',
    modification: 'augmentation_capital',
  }
  return map[type] ?? 'cession_entreprise'
}
