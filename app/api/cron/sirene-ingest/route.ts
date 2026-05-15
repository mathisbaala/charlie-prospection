import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import {
  extractDepartementFromCpFR,
  fetchSireneCreations,
  normaliseSireneNaf,
  resolveSireneName,
  type SireneEtablissement,
} from '@/lib/data-sources/sirene'
import type { SignalsInboxInsert } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function unauthorized() {
  return new NextResponse('Unauthorized', { status: 401 })
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

function buildInboxRow(et: SireneEtablissement): SignalsInboxInsert | null {
  if (!et.siret) return null
  const siren = et.siret.slice(0, 9)
  const cp = et.adresseEtablissement?.codePostalEtablissement ?? null
  const dateEvent = et.dateCreationEtablissement
    ? new Date(et.dateCreationEtablissement).toISOString()
    : new Date().toISOString()

  return {
    source: 'sirene',
    external_id: et.siret,
    date_event: dateEvent,
    siren,
    entreprise_nom: resolveSireneName(et),
    // NAF is the killer feature of Sirene vs BODACC — directly populated, no
    // SIRENE enrichment round-trip needed.
    code_naf: normaliseSireneNaf(et.uniteLegale?.activitePrincipaleUniteLegale ?? null),
    departement: extractDepartementFromCpFR(cp),
    // Sirene events are by construction creations (creation date is the filter).
    type_event: 'creation',
    raw_data: et as unknown as Record<string, unknown>,
  }
}

async function runIngest(): Promise<{
  fetched: number
  ingested: number
  skipped_duplicates: number
  skipped_invalid: number
}> {
  const token = process.env.INSEE_SIRENE_TOKEN
  if (!token) {
    // Graceful skip — code is live, waiting for credentials.
    throw new Error('INSEE_SIRENE_TOKEN not set — cron skipped')
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Window: yesterday → today. Sirene records get a `dateCreationEtablissement`
  // assigned on the day the SIRET is generated, so a 24h window captures
  // everything new without overlap with the previous run.
  const now = new Date()
  const untilDate = now.toISOString().slice(0, 10)
  const sinceDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const records = await fetchSireneCreations({ sinceDate, untilDate, token })

  const rows: SignalsInboxInsert[] = []
  let skippedInvalid = 0
  for (const rec of records) {
    const row = buildInboxRow(rec)
    if (!row) {
      skippedInvalid += 1
      continue
    }
    rows.push(row)
  }

  if (rows.length === 0) {
    return { fetched: records.length, ingested: 0, skipped_duplicates: 0, skipped_invalid: skippedInvalid }
  }

  const { data, error } = await supabase
    .from('prospection_signals_inbox')
    .upsert(rows, { onConflict: 'source,external_id', ignoreDuplicates: true })
    .select('id')

  if (error) {
    throw new Error(`signals_inbox upsert failed: ${error.message}`)
  }

  const ingested = data?.length ?? 0
  return {
    fetched: records.length,
    ingested,
    skipped_duplicates: rows.length - ingested,
    skipped_invalid: skippedInvalid,
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized()
  try {
    const result = await runIngest()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    // Treat missing token as a "skipped" 200, not a 500. The cron is wired up
    // but waiting for credentials — we don't want Vercel to alarm on this.
    if (message.includes('INSEE_SIRENE_TOKEN not set')) {
      return NextResponse.json({ ok: true, skipped: true, reason: message })
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
