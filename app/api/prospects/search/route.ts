import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchProspects } from '@/lib/prospect-search/engine'
import { enrichProspect } from '@/lib/enrichment/enricher'
import { scorePatrimony } from '@/lib/enrichment/patrimony-scorer'
import type { ParsedIcpCriteria } from '@/lib/types'

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
  if (!criteria) return NextResponse.json({ error: 'criteria required' }, { status: 400 })

  const limit = Math.min(body.limit ?? 20, 50)

  const rawProspects = await searchProspects(criteria, { limit })

  const saved: string[] = []

  for (const raw of rawProspects) {
    const linkedinUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(raw.dirigeant_prenom + ' ' + raw.dirigeant_nom + ' ' + raw.entreprise_nom)}`

    const { data: existing } = await supabase
      .from('prospection_prospects')
      .select('id')
      .eq('org_id', membership.org_id)
      .eq('linkedin_url', linkedinUrl)
      .single()

    if (existing) {
      saved.push(existing.id)
      continue
    }

    const enrichmentData = await enrichProspect(raw)
    const scoring = await scorePatrimony(enrichmentData)

    enrichmentData.valeur_entreprise_estimee = scoring.valeur_entreprise_estimee ?? undefined
    enrichmentData.revenus_implicites_estimes = scoring.revenus_implicites_estimes ?? undefined
    enrichmentData.patrimoine_total_estime = scoring.patrimoine_total_estime ?? undefined

    const linkedinData = {
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
        linkedin_url: linkedinUrl,
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

      if (enrichmentData.bodacc_events?.length) {
        const signalInserts = enrichmentData.bodacc_events
          .filter(e => e.type !== 'autre')
          .map(e => ({
            prospect_id: prospect.id,
            org_id: membership.org_id,
            type: mapBodaccToSignalType(e.type),
            source: 'bodacc' as const,
            data: { libelle: e.libelle, date_bodacc: e.date },
            detected_at: new Date(e.date).toISOString(),
          }))

        if (signalInserts.length > 0) {
          await supabase.from('prospection_signals').insert(signalInserts)
        }
      }
    }
  }

  return NextResponse.json({ count: saved.length, prospect_ids: saved })
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
