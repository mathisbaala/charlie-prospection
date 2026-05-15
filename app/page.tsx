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

  // New onboarding: no membership yet → land on /cible to create the first persona.
  if (!membership) redirect('/cible')

  // Returning user with at least one prospect in /suivi → straight to the suivi pipeline.
  // First-time user with empty suivi → hero search to define their first cible.
  const { count } = await supabase
    .from('prospection_prospects')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', membership.org_id)

  if ((count ?? 0) > 0) redirect('/suivi')

  // Reuse the most-recent persona's description (if any) so the user can refine
  // instead of starting over — picks the latest by updated_at.
  const { data: existingPersona } = await supabase
    .from('prospection_icps')
    .select('raw_description')
    .eq('org_id', membership.org_id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return <HeroSearch initialDescription={existingPersona?.raw_description ?? ''} />
}
