import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import type { Icp, ParsedIcpCriteria, SearchCandidate } from '@/lib/types'
import { queryPersons } from '@/lib/persons/query'
import type { PersonFilters, PersonHit } from '@/lib/persons/query'
import type { PersonType } from '@/lib/persons/types'
import {
  inferNafCodes,
  inferRppsProfession,
  locationsToDept,
} from '@/lib/discovery/infer-params'
import { getQuotaStatus } from '@/lib/observability/api-quota'

export const maxDuration = 60

/**
 * POST /api/recherche/run — recherche dans la base interne de personnes.
 *
 * Modèle Push : la base prospection_persons est pré-alimentée par les
 * fondateurs (POST /api/admin/ingest/persons) et enrichie en continu par le
 * cron enrich-persons. Cette route ne fait AUCUN appel API externe.
 *
 * Body: { persona_id: string, limit?: number }
 * Response: { candidates: SearchCandidate[], quota_pappers? }
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
  const limit = Math.min(typeof body.limit === 'number' ? body.limit : 50, 100)

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

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // ── Traduire les critères ICP en filtres DB ────────────────────────────────
  const nafCodes = inferNafCodes(criteria.roles ?? [], criteria.sectors ?? [])
  const dept = locationsToDept(criteria.locations ?? [])
  const rppsProfession = inferRppsProfession(criteria.roles ?? [], criteria.sectors ?? [])

  // Mapping RPPS profession → PersonType
  const RPPS_TO_PERSON_TYPE: Record<string, PersonType> = {
    Medecin: 'médecin',
    'Chirurgien-Dentiste': 'dentiste',
    Pharmacien: 'pharmacien',
    Kinesitherapeute: 'kiné',
    'Sage-Femme': 'autre_libéral',
  }
  const personTypes: PersonType[] | null = rppsProfession
    ? [RPPS_TO_PERSON_TYPE[rppsProfession] ?? 'autre_libéral']
    : null

  const filters: PersonFilters = {
    personTypes,
    nafCodes: nafCodes.length > 0 ? nafCodes : null,
    departements: dept ? [dept] : null,
  }

  // ── Requête DB-only ────────────────────────────────────────────────────────
  const hits: PersonHit[] = await queryPersons(serviceSupabase, filters, limit)

  if (hits.length === 0) {
    const quota = await getQuotaStatus('pappers')
    return NextResponse.json({ candidates: [], quota_pappers: quota ?? undefined })
  }

  // ── Marquer les prospects déjà en suivi ────────────────────────────────────
  const linkedinUrls = hits
    .map((h) => h.raw.linkedin_search_url)
    .filter(Boolean) as string[]

  const existingSet = new Set<string>()
  if (linkedinUrls.length > 0) {
    const { data: existing } = await supabase
      .from('prospection_prospects')
      .select('linkedin_url')
      .eq('org_id', membership.org_id)
      .in('linkedin_url', linkedinUrls)
    for (const r of existing ?? []) {
      if (r.linkedin_url) existingSet.add(r.linkedin_url)
    }
  }

  const candidates: SearchCandidate[] = hits.map((h) => ({
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

  const quota = await getQuotaStatus('pappers')
  return NextResponse.json({ candidates, quota_pappers: quota ?? undefined })
}
