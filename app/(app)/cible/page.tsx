import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CiblePageClient } from '@/components/cible/cible-page-client'
import type { Icp } from '@/lib/types'

/**
 * /cible — manage saved personas (multiple per org, editable, named).
 * Replaces the singleton /icp flow; old /icp keeps working until PR 5 swaps
 * the sidebar.
 */
export default async function CiblePage() {
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
    .order('updated_at', { ascending: false })

  return <CiblePageClient initialPersonas={(personas ?? []) as Icp[]} />
}
