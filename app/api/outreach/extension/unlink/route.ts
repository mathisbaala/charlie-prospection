// POST /api/outreach/extension/unlink
// Déliaison de l'extension. Accepte deux modes d'auth :
//   - Ext-Key (depuis l'extension)
//   - Cookie Supabase (depuis la page web — cas où l'extension a perdu son token)

import { NextResponse } from 'next/server'
import { authenticateExtension } from '@/lib/supabase/extension'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Mode 1 : extension envoie son Ext-Key
  const extAuth = await authenticateExtension(request)
  if (extAuth) {
    await service
      .from('prospection_linkedin_sessions')
      .delete()
      .eq('org_id', extAuth.org_id)
    return NextResponse.json({ ok: true, via: 'ext-key' })
  }

  // Mode 2 : page web authentifiée par cookie
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('prospection_organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 400 })

  await service
    .from('prospection_linkedin_sessions')
    .delete()
    .eq('org_id', membership.org_id)

  return NextResponse.json({ ok: true, via: 'cookie' })
}
