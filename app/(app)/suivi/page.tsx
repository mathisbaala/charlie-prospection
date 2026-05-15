import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { IntelligenceStripV2 } from '@/components/suivi/intelligence-strip-v2'
import { SuiviPageClient } from '@/components/suivi/suivi-page-client'
import type { Icp, Prospect } from '@/lib/types'

/**
 * /suivi — pipeline of tracked prospects, grouped by persona.
 *
 * Replaces /pipeline (old route stays alive until PR 5 redirects it).
 * Only prospects with icp_id set OR added via /recherche end up here — the
 * point of /suivi is curated monitoring.
 */
export default async function SuiviPage() {
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

  // Load personas (used for tab labels) + all prospects in suivi.
  const [{ data: personas }, { data: prospects }] = await Promise.all([
    supabase
      .from('prospection_icps')
      .select('*')
      .eq('org_id', membership.org_id)
      .order('updated_at', { ascending: false }),
    supabase
      .from('prospection_prospects')
      .select('*')
      .eq('org_id', membership.org_id)
      .order('patrimony_score', { ascending: false })
      .limit(200),
  ])

  return (
    <>
      <IntelligenceStripV2 />
      <SuiviPageClient
        personas={(personas ?? []) as Icp[]}
        prospects={(prospects ?? []) as Prospect[]}
      />
    </>
  )
}
