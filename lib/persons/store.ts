import type { SupabaseClient } from '@supabase/supabase-js'
import { canonicalPersonKey } from '@/lib/prospect-search/engine'
import type { RawProspect } from '@/lib/prospect-search/engine'
import type { PersonIngestInput, PersonEnrichmentLevel } from './types'

function buildLinkedInSearchUrl(prenom: string, nom: string, entreprise: string): string {
  const q = encodeURIComponent(`${prenom} ${nom} ${entreprise}`)
  return `https://www.linkedin.com/search/results/people/?keywords=${q}`
}

function buildRawProspect(input: PersonIngestInput, canonicalKey: string): RawProspect {
  return {
    uid: canonicalKey,
    source: 'annuaire_entreprises',
    source_type: 'personne_physique',
    entreprise_nom: input.entreprise_nom ?? '',
    siren: input.siren ?? '',
    code_naf: input.naf_code ?? '',
    libelle_naf: input.naf_libelle ?? '',
    date_creation: '',
    tranche_effectifs: '',
    adresse: input.adresse ?? '',
    code_postal: input.code_postal ?? '',
    ville: input.ville ?? '',
    departement: input.departement ?? '',
    dirigeant_nom: input.nom,
    dirigeant_prenom: input.prenom,
    dirigeant_qualite: input.profession_libelle ?? '',
    dirigeant_annee_naissance: input.annee_naissance,
    // linkedin_url direct si connu, sinon URL de recherche LinkedIn construite
    linkedin_search_url: input.linkedin_url ?? buildLinkedInSearchUrl(input.prenom, input.nom, input.entreprise_nom ?? ''),
    score_initial: 50,
  }
}

export async function upsertPersons(
  supabase: SupabaseClient,
  inputs: PersonIngestInput[],
): Promise<{ upserted: number; errors: number }> {
  if (inputs.length === 0) return { upserted: 0, errors: 0 }

  const rowMap = new Map<string, ReturnType<typeof buildRawProspect> & { canonical_key: string }>()
  for (const input of inputs) {
    const canonical_key = canonicalPersonKey(input.prenom, input.nom, input.siren)
    rowMap.set(canonical_key, {
      canonical_key,
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
      raw_data: buildRawProspect(input, canonical_key),
      updated_at: new Date().toISOString(),
    })
  }
  const rows = Array.from(rowMap.values())

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
