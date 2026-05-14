import { createClient } from '@/lib/supabase/server'
import { IcpBuilder } from '@/components/icp/icp-builder'

export default async function IcpPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let existingIcp = null
  if (user) {
    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()
    if (membership) {
      const { data } = await supabase
        .from('icps')
        .select()
        .eq('org_id', membership.org_id)
        .eq('status', 'active')
        .single()
      existingIcp = data
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Mon ICP</h1>
        <p className="text-gray-500 mt-1">
          Décrivez votre client idéal — l'IA génère automatiquement les requêtes de recherche LinkedIn.
        </p>
      </div>
      <IcpBuilder initialIcp={existingIcp} />
    </div>
  )
}
