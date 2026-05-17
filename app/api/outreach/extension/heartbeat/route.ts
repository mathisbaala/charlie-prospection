// POST /api/outreach/extension/heartbeat
// Ping toutes les 5 min par le service worker de l'extension.
// Auth: Ext-Key.

import { NextResponse } from 'next/server'
import { authenticateExtension } from '@/lib/supabase/extension'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  const auth = await authenticateExtension(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  await service
    .from('prospection_linkedin_sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', auth.session_id)

  return NextResponse.json({ ok: true })
}
