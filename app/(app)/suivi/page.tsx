import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { IntelligenceStripV2 } from '@/components/suivi/intelligence-strip-v2'
import { SuiviPageClient } from '@/components/suivi/suivi-page-client'
import type { Icp, Prospect } from '@/lib/types'

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

/**
 * /suivi — pipeline of tracked prospects, grouped by persona, with
 * per-persona overview cards at the top.
 *
 * Only prospects with icp_id set OR added via /recherche end up here — the
 * point of /suivi is curated monitoring.
 */
export default async function SuiviPage({ searchParams: searchParamsPromise }: PageProps) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('prospection_organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) redirect('/')

  // Pagination via ?page=N — defaults to 1. Page size is fixed at 200 to keep
  // the list responsive; orgs with more prospects can navigate next/prev.
  const sp = (await searchParamsPromise) ?? {}
  const pageSize = 200
  const page = Math.max(1, parseInt((sp.page as string) ?? '1', 10) || 1)
  const offset = (page - 1) * pageSize

  // Personas + prospects. We compute the overview cards on the server so the
  // client doesn't need a separate fetch round-trip.
  const [{ data: personas }, { data: prospects, count: totalProspects }] = await Promise.all([
    supabase
      .from('prospection_icps')
      .select('*')
      .eq('org_id', membership.org_id)
      .order('updated_at', { ascending: false }),
    supabase
      .from('prospection_prospects')
      .select('*', { count: 'exact' })
      .eq('org_id', membership.org_id)
      .order('patrimony_score', { ascending: false })
      .range(offset, offset + pageSize - 1),
  ])

  // Per-persona signal counts (last 7 days, excluding depot_comptes noise).
  // Service role for the join — RLS on prospection_signals would force a
  // per-row check; the join is faster server-side. We already verified org
  // membership above.
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  // eslint-disable-next-line react-hooks/purity
  const sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000
  const since = new Date(sinceMs).toISOString()
  const { data: signalRows } = await service
    .from('prospection_signals')
    .select(`prospection_prospects!inner(icp_id)`)
    .eq('org_id', membership.org_id)
    .gte('detected_at', since)
    .neq('type', 'depot_comptes')
    .limit(2000)

  // Aggregate signal count per persona_id (null icp_id → "Sans cible" bucket).
  const signalsByPersona = new Map<string, number>()
  for (const r of (signalRows ?? []) as unknown as Array<{
    prospection_prospects: { icp_id: string | null } | null
  }>) {
    const key = r.prospection_prospects?.icp_id ?? '__orphan__'
    signalsByPersona.set(key, (signalsByPersona.get(key) ?? 0) + 1)
  }

  return (
    <>
      <IntelligenceStripV2 />
      <SuiviPageClient
        personas={(personas ?? []) as Icp[]}
        prospects={(prospects ?? []) as Prospect[]}
        signalsByPersona={Object.fromEntries(signalsByPersona)}
        pagination={{
          page,
          pageSize,
          total: totalProspects ?? prospects?.length ?? 0,
        }}
      />
    </>
  )
}
