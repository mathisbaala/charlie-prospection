import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { HeroSearch } from '@/components/search/hero-search'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('prospection_organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) redirect('/icp')

  // Returning user with at least one prospect → straight to the pipeline.
  // First-time user with empty pipeline → hero search to define their first ICP.
  const { count } = await supabase
    .from('prospection_prospects')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', membership.org_id)

  if ((count ?? 0) > 0) redirect('/pipeline')

  // Reuse existing ICP description if any (so user can refine instead of start over)
  const { data: existingIcp } = await supabase
    .from('prospection_icps')
    .select('raw_description')
    .eq('org_id', membership.org_id)
    .eq('status', 'active')
    .single()

  return <HeroSearch initialDescription={existingIcp?.raw_description ?? ''} />
}
