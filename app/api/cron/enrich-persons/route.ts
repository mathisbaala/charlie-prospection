import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { enrichProspect } from '@/lib/enrichment/enricher'
import { scorePatrimony } from '@/lib/enrichment/patrimony-scorer'
import { assessProspectQuality } from '@/lib/prospect-search/quality-filter'
import { updatePersonEnrichment } from '@/lib/persons/store'
import type { RawProspect } from '@/lib/prospect-search/engine'
import { canonicalPersonKey } from '@/lib/prospect-search/engine'

export const maxDuration = 300

const BATCH_SIZE = 10

type PersonRow = {
  canonical_key: string
  prenom: string
  nom: string
  siren: string | null
  naf_code: string | null
  naf_libelle: string | null
  entreprise_nom: string | null
  departement: string | null
  ville: string | null
  adresse: string | null
  code_postal: string | null
  linkedin_url: string | null
  raw_data: Record<string, unknown> | null
}

function personRowToRaw(row: PersonRow): RawProspect {
  // Réutilise le snapshot RawProspect si disponible (cohérence avec enrichProspect)
  if (row.raw_data && typeof row.raw_data === 'object' && 'uid' in row.raw_data) {
    return row.raw_data as unknown as RawProspect
  }
  const key = canonicalPersonKey(row.prenom, row.nom, row.siren ?? undefined)
  return {
    uid: key,
    source: 'annuaire_entreprises',
    source_type: 'personne_physique',
    entreprise_nom: row.entreprise_nom ?? '',
    siren: row.siren ?? '',
    code_naf: row.naf_code ?? '',
    libelle_naf: row.naf_libelle ?? '',
    date_creation: '',
    tranche_effectifs: '',
    adresse: row.adresse ?? '',
    code_postal: row.code_postal ?? '',
    ville: row.ville ?? '',
    departement: row.departement ?? '',
    dirigeant_nom: row.nom,
    dirigeant_prenom: row.prenom,
    dirigeant_qualite: '',
    linkedin_search_url: row.linkedin_url ?? '',
    score_initial: 50,
  }
}

/**
 * GET /api/cron/enrich-persons
 *
 * Enrichit les entrées 'raw' de prospection_persons.
 * Sélectionne les BATCH_SIZE plus anciennes (FIFO), lance enrichProspect()
 * + scorePatrimony(), met à jour enrichment_level='standard'.
 *
 * Appelé par le cron Vercel quotidiennement à 07:00 UTC.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: toEnrich, error } = await supabase
    .from('prospection_persons')
    .select(
      'canonical_key, prenom, nom, siren, naf_code, naf_libelle, entreprise_nom, departement, ville, adresse, code_postal, linkedin_url, raw_data',
    )
    .eq('enrichment_level', 'raw')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!toEnrich || toEnrich.length === 0) {
    return NextResponse.json({ ok: true, enriched: 0, dropped: 0 })
  }

  let enriched = 0
  let dropped = 0

  for (const row of toEnrich as PersonRow[]) {
    try {
      const raw = personRowToRaw(row)
      const enrichmentData = await enrichProspect(raw)
      const quality = assessProspectQuality(enrichmentData)

      if (quality.drop) {
        await updatePersonEnrichment(supabase, row.canonical_key, {}, 0, null, 'dropped')
        dropped++
        continue
      }

      const scoring = await scorePatrimony(enrichmentData)
      enrichmentData.valeur_entreprise_estimee = scoring.valeur_entreprise_estimee ?? undefined
      enrichmentData.revenus_implicites_estimes = scoring.revenus_implicites_estimes ?? undefined
      enrichmentData.patrimoine_total_estime = scoring.patrimoine_total_estime ?? undefined
      enrichmentData.score_breakdown = scoring.breakdown
      enrichmentData.facteurs_cles = scoring.facteurs_cles

      await updatePersonEnrichment(
        supabase,
        row.canonical_key,
        enrichmentData as Record<string, unknown>,
        scoring.score,
        scoring.raison_principale ?? null,
      )
      enriched++
    } catch (err) {
      console.error('[enrich-persons] error on', row.canonical_key, err)
      // Marquer en dropped pour sortir de la file FIFO et éviter la boucle infinie
      await updatePersonEnrichment(supabase, row.canonical_key, {}, 0, null, 'dropped')
      dropped++
    }
  }

  return NextResponse.json({ ok: true, enriched, dropped })
}
