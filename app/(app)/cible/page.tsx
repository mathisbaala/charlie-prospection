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
    .select('*, prospect_count:prospection_prospects(count)')
    .eq('org_id', membership.org_id)
    .order('updated_at', { ascending: false })

  // PostgREST returns the aggregate as `[{count: N}]` — flatten to a number
  // on each persona row so the client can use it directly for delete-confirm
  // and the persona-list badge.
  const normalised = (personas ?? []).map((p: { prospect_count?: Array<{ count: number }> | number } & Record<string, unknown>) => ({
    ...p,
    prospect_count: Array.isArray(p.prospect_count)
      ? (p.prospect_count[0]?.count ?? 0)
      : (typeof p.prospect_count === 'number' ? p.prospect_count : 0),
  })) as Icp[]

  return <CiblePageClient initialPersonas={normalised} />
}
