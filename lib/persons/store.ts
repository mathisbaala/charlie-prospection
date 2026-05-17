import type { SupabaseClient } from '@supabase/supabase-js'
import { canonicalPersonKey } from '@/lib/prospect-search/engine'
import type { PersonIngestInput, PersonEnrichmentLevel } from './types'

export async function upsertPersons(
  supabase: SupabaseClient,
  inputs: PersonIngestInput[],
): Promise<{ upserted: number; errors: number }> {
  if (inputs.length === 0) return { upserted: 0, errors: 0 }

  const rows = inputs.map((input) => ({
    canonical_key: canonicalPersonKey(input.prenom, input.nom, input.siren),
    prenom: input.prenom,
    nom: input.nom,
    annee_naissance: input.annee_naissance ?? null,
    person_type: input.person_type ?? 'dirigeant',
    profession_libelle: input.profession_libelle ?? null,
    rpps_number: input.rpps_number ?? null,
    siren: input.siren ?? null,
    siret: input.siret ?? null,
    naf_code: input.naf_code ?? null,
    naf_libelle: input.naf_libelle ?? null,
    entreprise_nom: input.entreprise_nom ?? null,
    departement: input.departement ?? null,
    ville: input.ville ?? null,
    adresse: input.adresse ?? null,
    code_postal: input.code_postal ?? null,
    linkedin_url: input.linkedin_url ?? null,
    ingest_sources: [input.source],
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('prospection_persons')
    .upsert(rows, { onConflict: 'canonical_key', ignoreDuplicates: false })

  if (error) {
    console.error('[persons/store] upsert error:', error.message)
    return { upserted: 0, errors: inputs.length }
  }

  return { upserted: rows.length, errors: 0 }
}

export async function updatePersonEnrichment(
  supabase: SupabaseClient,
  canonicalKey: string,
  extendedData: Record<string, unknown>,
  patrimonyScore: number,
  raisonPrincipale: string | null,
  level: PersonEnrichmentLevel = 'standard',
): Promise<void> {
  const { error } = await supabase
    .from('prospection_persons')
    .update({
      extended_data: extendedData,
      patrimony_score: patrimonyScore,
      raison_principale: raisonPrincipale,
      enrichment_level: level,
      enriched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('canonical_key', canonicalKey)

  if (error) {
    console.error('[persons/store] update enrichment error:', error.message)
  }
}
