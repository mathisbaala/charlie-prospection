import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { upsertPersons } from '@/lib/persons/store'
import type { PersonIngestInput } from '@/lib/persons/types'

export const maxDuration = 300

/**
 * POST /api/admin/ingest/persons
 *
 * Endpoint d'alimentation de la base interne de personnes.
 * Protégé par la clé ADMIN_API_KEY (header x-admin-key).
 *
 * Body: { persons: PersonIngestInput[] }
 * Max 500 personnes par batch.
 *
 * Les personnes sont insérées avec enrichment_level='raw'.
 * Le cron /api/cron/enrich-persons les enrichit de façon asynchrone.
 */
export async function POST(request: Request) {
  const adminKey = request.headers.get('x-admin-key')
  if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.persons)) {
    return NextResponse.json({ error: 'body.persons[] requis' }, { status: 400 })
  }

  const persons: PersonIngestInput[] = body.persons
  if (persons.length === 0) {
    return NextResponse.json({ ok: true, upserted: 0, errors: 0 })
  }
  if (persons.length > 500) {
    return NextResponse.json({ error: 'Max 500 personnes par batch' }, { status: 400 })
  }

  // Validation minimale
  const invalid = persons.filter((p) => !p.prenom || !p.nom || !p.source)
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `${invalid.length} entrée(s) sans prenom/nom/source` },
      { status: 400 },
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const result = await upsertPersons(supabase, persons)
  return NextResponse.json({ ok: true, ...result })
}
