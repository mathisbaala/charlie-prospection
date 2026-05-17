// GET /api/outreach/extension/connected
// Appelé par la page /outreach pour savoir si l'extension est liée ET LinkedIn valide.
// Auth: cookie Supabase (utilisateur connecté dans le browser).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('prospection_linkedin_sessions')
    .select('is_valid, last_seen_at, api_token')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!data) {
    return NextResponse.json({ extension_linked: false, linkedin_valid: false })
  }

  const extensionLinked = !!data.api_token
  const linkedinValid = data.is_valid && !!data.last_seen_at

  // Considérer la session LinkedIn stale si last_seen > 48h
  let linkedinStale = false
  if (data.last_seen_at) {
    const ageMs = Date.now() - new Date(data.last_seen_at).getTime()
    linkedinStale = ageMs > 48 * 60 * 60 * 1000
  }

  return NextResponse.json({
    extension_linked: extensionLinked,
    linkedin_valid: linkedinValid && !linkedinStale,
    last_seen_at: data.last_seen_at,
  })
}
