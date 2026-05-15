import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { enrichProspect } from '@/lib/enrichment/enricher'
import { scorePatrimony } from '@/lib/enrichment/patrimony-scorer'
import type { RawProspect } from '@/lib/prospect-search/engine'
import type { ProspectEnrichmentData } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// How many prospects to refresh per cron tick. Bounded so we don't blow
// through the Pappers quota in one run. With ~5 calls per prospect, batch=10
// means ~50 Pappers calls per day.
const BATCH_SIZE = 10

// Skip prospects refreshed more recently than this — there's no point
// re-enriching every day if nothing changes daily on Pappers/BODACC anyway.
const REFRESH_AFTER_DAYS = 7

function unauthorized() {
  return new NextResponse('Unauthorized', { status: 401 })
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

interface ProspectRow {
  id: string
  org_id: string
  linkedin_data: Record<string, unknown> | null
  enrichment_data: ProspectEnrichmentData & Record<string, unknown>
}

/**
 * Reconstruct a RawProspect from a stored prospection_prospects row.
 * The enricher accepts a RawProspect and re-fetches all sources, so we
 * synthesize one from the persisted identity fields.
 */
function rebuildRaw(p: ProspectRow): RawProspect | null {
  const ed = p.enrichment_data
  const ld = (p.linkedin_data ?? {}) as Record<string, string>
  const siren = ed?.siren
  const prenom = ed?.dirigeant_prenom ?? ld.prenom ?? ''
  const nom = ed?.dirigeant_nom ?? ld.nom_de_famille ?? ''
  if (!siren || !prenom || !nom) return null

  return {
    uid: `${prenom}|${nom}|${siren}`,
    source: (ld.source as 'pappers' | 'annuaire_entreprises') ?? 'pappers',
    source_type:
      (ld.source_type as 'personne_morale' | 'personne_physique') ?? 'personne_morale',
    entreprise_nom: (ld.entreprise as string) ?? ed?.libelle_naf ?? '',
    siren,
    code_naf: ed?.code_naf ?? '',
    libelle_naf: ed?.libelle_naf ?? '',
    date_creation: ed?.date_creation_entreprise ?? '',
    tranche_effectifs: ed?.tranche_effectifs ?? '',
    adresse: ed?.adresse_entreprise ?? '',
    code_postal: ed?.code_postal ?? '',
    ville: ed?.ville ?? '',
    departement: ed?.departement ?? '',
    dirigeant_nom: nom,
    dirigeant_prenom: prenom,
    dirigeant_qualite: ed?.dirigeant_qualite ?? '',
    dirigeant_annee_naissance: ed?.dirigeant_annee_naissance,
    linkedin_search_url: (ld.linkedin_search_url as string) ?? '',
    score_initial: 0,
  }
}

async function runRefresh(): Promise<{
  candidates: number
  refreshed: number
  skipped_invalid: number
  failed: number
}> {
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Stale cutoff: re-enrich only prospects whose last enrichment is older than
  // REFRESH_AFTER_DAYS. Computed as ISO timestamp passed to Supabase.
  const staleMs = Date.now() - REFRESH_AFTER_DAYS * 24 * 60 * 60 * 1000
  const staleBefore = new Date(staleMs).toISOString()

  // Pick prospects in /suivi (icp_id NOT NULL), oldest enriched first.
  // enrichi_le lives inside the JSONB; we sort by JSONB path. NULL enrichi_le
  // (legacy rows) is treated as oldest by Postgres NULLS FIRST default — good.
  const { data: prospects, error } = await supabase
    .from('prospection_prospects')
    .select('id, org_id, linkedin_data, enrichment_data')
    .not('icp_id', 'is', null)
    .or(`enrichment_data->>enrichi_le.is.null,enrichment_data->>enrichi_le.lt.${staleBefore}`)
    .order('enrichment_data->>enrichi_le', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE)

  if (error) throw new Error(`fetching prospects: ${error.message}`)
  if (!prospects || prospects.length === 0) {
    return { candidates: 0, refreshed: 0, skipped_invalid: 0, failed: 0 }
  }

  let refreshed = 0
  let skippedInvalid = 0
  let failed = 0

  for (const p of prospects as ProspectRow[]) {
    const raw = rebuildRaw(p)
    if (!raw) {
      skippedInvalid += 1
      continue
    }
    try {
      const fresh = await enrichProspect(raw)
      const scoring = await scorePatrimony(fresh)
      fresh.valeur_entreprise_estimee = scoring.valeur_entreprise_estimee ?? undefined
      fresh.revenus_implicites_estimes = scoring.revenus_implicites_estimes ?? undefined
      fresh.patrimoine_total_estime = scoring.patrimoine_total_estime ?? undefined
      fresh.score_breakdown = scoring.breakdown
      fresh.facteurs_cles = scoring.facteurs_cles

      const { error: upErr } = await supabase
        .from('prospection_prospects')
        .update({
          enrichment_data: fresh,
          patrimony_score: scoring.score,
        })
        .eq('id', p.id)

      if (upErr) {
        failed += 1
        continue
      }
      refreshed += 1
    } catch {
      failed += 1
    }
  }

  return { candidates: prospects.length, refreshed, skipped_invalid: skippedInvalid, failed }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized()
  try {
    const result = await runRefresh()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
