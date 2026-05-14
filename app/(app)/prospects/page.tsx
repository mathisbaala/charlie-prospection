import { createClient } from '@/lib/supabase/server'
import { ProspectsClientPage } from '@/components/prospects/prospects-client-page'
import type { Prospect, Icp } from '@/lib/types'

export default async function ProspectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let icp: Icp | null = null
  let prospects: Prospect[] = []

  if (user) {
    const { data: membership } = await supabase
      .from('prospection_organization_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()

    if (membership) {
      const [icpResult, prospectsResult] = await Promise.all([
        supabase
          .from('prospection_icps')
          .select()
          .eq('org_id', membership.org_id)
          .eq('status', 'active')
          .single(),
        supabase
          .from('prospection_prospects')
          .select('*')
          .eq('org_id', membership.org_id)
          .order('patrimony_score', { ascending: false })
          .limit(50),
      ])
      icp = icpResult.data as Icp | null
      prospects = (prospectsResult.data ?? []) as Prospect[]
    }
  }

  return <ProspectsClientPage icp={icp} initialProspects={prospects} />
}
