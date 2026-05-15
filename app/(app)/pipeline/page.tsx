import { createClient } from '@/lib/supabase/server'
import { PipelineClient } from '@/components/prospects/pipeline-client'
import { IntelligenceStrip } from '@/components/intelligence-strip'
import type { Prospect } from '@/lib/types'

export default async function PipelinePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let prospects: Prospect[] = []

  if (user) {
    const { data: membership } = await supabase
      .from('prospection_organization_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()

    if (membership) {
      const { data } = await supabase
        .from('prospection_prospects')
        .select('*')
        .eq('org_id', membership.org_id)
        .order('patrimony_score', { ascending: false })
        .limit(50)
      prospects = (data ?? []) as Prospect[]
    }
  }

  return (
    <>
      <IntelligenceStrip />
      <PipelineClient initialProspects={prospects} />
    </>
  )
}
