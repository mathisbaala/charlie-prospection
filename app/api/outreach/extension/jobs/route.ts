// GET /api/outreach/extension/jobs
// Retourne la liste des jobs à exécuter maintenant pour l'extension.
// Auth: Ext-Key.

import { NextResponse } from 'next/server'
import { authenticateExtension } from '@/lib/supabase/extension'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { computeJobs } from '@/lib/outreach/campaign-helpers'

export async function GET(request: Request) {
  const auth = await authenticateExtension(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Charger les paramètres de la session : quota search bloqué + limites quotidiennes
  const { data: session } = await service
    .from('prospection_linkedin_sessions')
    .select('search_quota_blocked_until, daily_invitation_limit, daily_dm_limit, daily_check_connection_limit')
    .eq('id', auth.session_id)
    .maybeSingle()

  const blockedUntil = session?.search_quota_blocked_until
    ? new Date(session.search_quota_blocked_until)
    : null
  const searchBlocked = !!blockedUntil && blockedUntil > new Date()

  const customLimits = {
    send_invitation: session?.daily_invitation_limit ?? 30,
    send_dm: session?.daily_dm_limit ?? 50,
    check_connection: session?.daily_check_connection_limit ?? 100,
  }

  // Charger les enrôlements actifs avec les steps de leur campagne et le prospect
  const { data: enrollments, error } = await service
    .from('prospection_campaign_enrollments')
    .select(`
      id, campaign_id, prospect_id, status, current_step,
      linkedin_url_resolved, last_action_at, fail_count,
      prospect:prospection_prospects(
        id, linkedin_data, enrichment_data, patrimony_score
      ),
      campaign:prospection_campaigns!inner(
        status,
        steps:prospection_campaign_steps(
          id, position, type, delay_days, template
        )
      )
    `)
    .eq('org_id', auth.org_id)
    .in('status', ['pending', 'profile_search', 'invitation_sent', 'connected'])
    .order('enrolled_at', { ascending: true })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Filtrer les campagnes actives seulement + mettre les steps à plat
  const active = (enrollments ?? [])
    .filter((e: Record<string, unknown>) => (e.campaign as Record<string, unknown>)?.status === 'active')
    .map((e: Record<string, unknown>) => ({
      ...e,
      steps: ((e.campaign as Record<string, unknown>)?.steps as unknown[]) ?? [],
    }))

  let jobs = computeJobs(active as Parameters<typeof computeJobs>[0], customLimits)

  // Si le quota search est bloqué, on retire les jobs profile_search du batch.
  // Les autres types (send_invitation/check_connection/send_dm) restent OK car
  // ils utilisent une URL déjà résolue, pas la search.
  if (searchBlocked) {
    jobs = jobs.filter(j => j.type !== 'profile_search')
  }

  return NextResponse.json({
    jobs,
    count: jobs.length,
    search_blocked_until: searchBlocked ? blockedUntil!.toISOString() : null,
  })
}
