// POST /api/outreach/extension/session
// Stocke le cookie LinkedIn li_at capturé par l'extension.
// Auth: Ext-Key header (api_token long-lived).

import { NextResponse } from 'next/server'
import { authenticateExtension } from '@/lib/supabase/extension'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import crypto from 'crypto'

function encrypt(text: string): string {
  const key = process.env.LINKEDIN_SESSION_ENCRYPTION_KEY
  if (!key) return text // fallback si env manquant (dev sans encryption)

  const keyBuf = Buffer.from(key.padEnd(64, '0').slice(0, 64), 'hex')
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', keyBuf, iv)
  const encrypted = Buffer.concat([cipher.update(text), cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

export async function POST(request: Request) {
  const auth = await authenticateExtension(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const { li_at } = body ?? {}
  if (!li_at || typeof li_at !== 'string') {
    return NextResponse.json({ error: 'Missing li_at' }, { status: 400 })
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  await service
    .from('prospection_linkedin_sessions')
    .update({
      li_at_encrypted: encrypt(li_at),
      is_valid: true,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', auth.session_id)

  return NextResponse.json({ ok: true })
}
