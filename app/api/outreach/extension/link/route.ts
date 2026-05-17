// GET  /api/outreach/extension/link  — génère un code PIN court (10 min, usage unique)
// POST /api/outreach/extension/link  — échange le code PIN contre un api_token long-lived

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// GET — appelé par la page /outreach quand ?link_ext={extensionId} est détecté
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('prospection_organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 400 })

  // Nettoyer les anciens tokens de cet utilisateur
  await supabase
    .from('prospection_extension_link_tokens')
    .delete()
    .eq('user_id', user.id)

  // Code PIN court et lisible (6 chars majuscules) — l'utilisateur le tape dans le popup
  const pin = crypto.randomBytes(3).toString('hex').toUpperCase()

  await supabase.from('prospection_extension_link_tokens').insert({
    user_id: user.id,
    org_id: membership.org_id,
    token: pin,
  })

  return NextResponse.json({ token: pin, expires_in: 600 })
}

// POST — appelé par l'extension pour échanger le token contre un api_token long-lived
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const { token } = body ?? {}
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: row } = await service
    .from('prospection_extension_link_tokens')
    .select('*')
    .eq('token', token)
    .eq('used', false)
    .maybeSingle()

  if (!row) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  if (new Date(row.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Token expired' }, { status: 401 })
  }

  // Marquer le token comme utilisé
  await service
    .from('prospection_extension_link_tokens')
    .update({ used: true })
    .eq('id', row.id)

  // Créer ou mettre à jour la session LinkedIn avec un api_token long-lived
  const api_token = 'ext_' + crypto.randomBytes(24).toString('hex')

  await service
    .from('prospection_linkedin_sessions')
    .upsert({
      user_id: row.user_id,
      org_id: row.org_id,
      api_token,
      is_valid: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'org_id,user_id' })

  return NextResponse.json({ api_token })
}
