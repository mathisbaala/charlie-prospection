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

  const allRows = inputs.map((input) => {
    // Pour les professions RPPS, le numéro RPPS est l'identifiant national unique.
    // Sans lui, deux "Jean Martin" de départements différents fusionnent en un seul
    // enregistrement (collision sur prenom|nom|—). Le RPPS garantit l'unicité réelle.
    const canonical_key = input.rpps_number
      ? `rpps|${input.rpps_number}`
      : canonicalPersonKey(input.prenom, input.nom, input.siren)
    return {
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
    }
  })
  const rows = Array.from(new Map(allRows.map(r => [r.canonical_key, r])).values())

  // Supabase statement_timeout fires on large batch upserts → chunk into ≤30-row slices
  const CHUNK = 30
  let totalUpserted = 0
  let totalErrors = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('prospection_persons')
      .upsert(chunk, { onConflict: 'canonical_key', ignoreDuplicates: false })
    if (error) {
      console.error('[persons/store] upsert error:', error.message)
      totalErrors += chunk.length
    } else {
      totalUpserted += chunk.length
    }
  }

  return { upserted: totalUpserted, errors: totalErrors }
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
