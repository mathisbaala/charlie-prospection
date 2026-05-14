import { createClient } from '@/lib/supabase/server'
import { IcpBuilder } from '@/components/icp/icp-builder'

export default async function IcpPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let existingIcp = null
  if (user) {
    const { data: membership } = await supabase
      .from('prospection_organization_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()
    if (membership) {
      const { data } = await supabase
        .from('prospection_icps')
        .select()
        .eq('org_id', membership.org_id)
        .eq('status', 'active')
        .single()
      existingIcp = data
    }
  }

  return (
    <div style={{ padding: '40px 48px' }}>
      <div className="mb-8">
        <h1
          className="font-display"
          style={{
            fontSize: 36,
            fontWeight: 700,
            color: 'var(--color-text)',
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
          }}
        >
          Mon ICP
        </h1>
        <p
          className="mt-2"
          style={{ color: 'var(--color-muted)', fontSize: 14, maxWidth: 560 }}
        >
          Décrivez votre client idéal — l&apos;IA génère automatiquement les requêtes de recherche LinkedIn.
        </p>
      </div>
      <IcpBuilder initialIcp={existingIcp} />
    </div>
  )
}
