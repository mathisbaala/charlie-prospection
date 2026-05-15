import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RecherchePageClient } from '@/components/recherche/recherche-page-client'
import type { Icp } from '@/lib/types'

/**
 * /recherche — pick a saved persona, run an enriched search, choose which
 * results to add to /suivi. Doesn't persist anything until the user adds.
 * Old /prospects keeps cohabiting until PR 5 swaps the sidebar.
 */
export default async function RecherchePage() {
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

  const { data: personas } = await supabase
    .from('prospection_icps')
    .select('*')
    .eq('org_id', membership.org_id)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })

  return <RecherchePageClient personas={(personas ?? []) as Icp[]} />
}
