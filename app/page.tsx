import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LandingPublic } from '@/components/landing/landing-public'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return <LandingPublic />

  const { data: membership } = await supabase
    .from('prospection_organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) redirect('/cible')

  redirect('/suivi')
}
