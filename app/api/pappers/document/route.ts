// Proxy endpoint for Pappers Premium document downloads (PDF actes,
// PDF/XLSX comptes annuels). Each Premium payload returns a per-document
// `token` that, combined with our `api_token`, yields the file from
// `GET https://api.pappers.fr/v2/document/telechargement`.
//
// We never expose the api_token to the client — the browser only knows the
// document `token`, which is opaque + tied to that one document. We also
// verify the token belongs to the prospect's persisted Premium payload to
// prevent a user from passing an arbitrary Pappers token through our proxy.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PappersPremiumData } from '@/lib/types'

const PAPPERS_DOC_BASE = 'https://api.pappers.fr/v2/document/telechargement'

function tokenBelongsToPremium(token: string, premium: PappersPremiumData): boolean {
  for (const d of premium.depots_actes ?? []) {
    if (d.token === token) return true
  }
  for (const c of premium.comptes ?? []) {
    if (c.token === token || c.token_xlsx === token) return true
  }
  return false
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const prospectId = url.searchParams.get('prospect_id')
  const filename = url.searchParams.get('filename') ?? 'document.pdf'
  const variant = url.searchParams.get('variant') === 'xlsx' ? 'xlsx' : 'pdf'

  if (!token || !prospectId) {
    return NextResponse.json({ error: 'token et prospect_id requis' }, { status: 400 })
  }
  // Pappers tokens are opaque hex/base64-ish strings — basic shape guard to
  // avoid passing arbitrary user input through to the upstream URL.
  if (!/^[A-Za-z0-9_\-=.]{8,256}$/.test(token)) {
    return NextResponse.json({ error: 'token invalide' }, { status: 400 })
  }

  // RLS scopes this read to the user's org — if they don't own this prospect,
  // they get NULL back. Then we verify the token belongs to the persisted
  // Premium payload so a user can't sweep tokens off other documents.
  const { data: prospect, error: pErr } = await supabase
    .from('prospection_prospects')
    .select('enrichment_data')
    .eq('id', prospectId)
    .maybeSingle()
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
  if (!prospect) return NextResponse.json({ error: 'Prospect introuvable' }, { status: 404 })

  const premium = (prospect.enrichment_data as { pappers_premium?: PappersPremiumData } | null)
    ?.pappers_premium
  if (!premium || !tokenBelongsToPremium(token, premium)) {
    return NextResponse.json({ error: 'Token introuvable sur ce prospect' }, { status: 404 })
  }

  const apiToken = process.env.PAPPERS_API_KEY
  if (!apiToken) {
    return NextResponse.json({ error: 'Pappers non configuré' }, { status: 500 })
  }

  const upstream = `${PAPPERS_DOC_BASE}?api_token=${apiToken}&token=${encodeURIComponent(token)}`
  const upstreamRes = await fetch(upstream, { cache: 'no-store' })
  if (!upstreamRes.ok || !upstreamRes.body) {
    return NextResponse.json(
      { error: `Pappers a refusé : ${upstreamRes.status}` },
      { status: upstreamRes.status },
    )
  }

  // Stream upstream through without buffering. Disposition: attachment so
  // the browser downloads instead of trying to render (avoids PDF.js
  // attempting to open an XLSX file inline).
  const contentType =
    upstreamRes.headers.get('content-type') ??
    (variant === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/pdf')

  return new NextResponse(upstreamRes.body, {
    status: 200,
    headers: {
      'content-type': contentType,
      'content-disposition': `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      'cache-control': 'private, max-age=300',
    },
  })
}
