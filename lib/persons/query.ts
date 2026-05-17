import type { SupabaseClient } from '@supabase/supabase-js'
import type { RawProspect } from '@/lib/prospect-search/engine'
import type { SearchCandidate, ProspectEnrichmentData } from '@/lib/types'
import type { PersonType } from './types'

export interface PersonFilters {
  /** Filtrage par type de personne (santé, juridique…) */
  personTypes: PersonType[] | null
  /** Filtrage par code NAF (dirigeants, libéraux en société) */
  nafCodes: string[] | null
  /** Filtrage par département */
  departements: string[] | null
}

export interface PersonHit {
  uid: string
  raw: RawProspect
  enrichment_data: ProspectEnrichmentData
  patrimony_score: number
  niveau: SearchCandidate['niveau']
  raison_principale: string
}

function scoreToNiveau(score: number): SearchCandidate['niveau'] {
  if (score >= 75) return 'prioritaire'
  if (score >= 50) return 'fort'
  if (score >= 25) return 'moyen'
  return 'faible'
}

export async function queryPersons(
  supabase: SupabaseClient,
  filters: PersonFilters,
  limit: number,
): Promise<PersonHit[]> {
  if (!filters.personTypes && !filters.nafCodes && !filters.departements) return []

  let query = supabase
    .from('prospection_persons')
    .select(
      'canonical_key, prenom, nom, siren, departement, naf_code, person_type, raw_data, extended_data, patrimony_score, raison_principale',
    )
    .not('patrimony_score', 'is', null)
    .order('patrimony_score', { ascending: false, nullsFirst: false })
    .limit(limit)

  // NAF codes priment sur person_type (plus précis pour dirigeants et libéraux en société)
  if (filters.nafCodes && filters.nafCodes.length > 0) {
    query = query.in('naf_code', filters.nafCodes)
  } else if (filters.personTypes && filters.personTypes.length > 0) {
    query = query.in('person_type', filters.personTypes)
  }

  if (filters.departements && filters.departements.length > 0) {
    query = query.in('departement', filters.departements)
  }

  const { data, error } = await query
  if (error || !data) return []

  return data.map((row) => {
    const score = row.patrimony_score ?? 0

    // Réutilise raw_data si disponible (snapshot RawProspect), sinon reconstruit un minimal
    const raw: RawProspect = row.raw_data
      ? (row.raw_data as RawProspect)
      : {
          uid: row.canonical_key,
          source: 'annuaire_entreprises',
          source_type: 'personne_physique',
          entreprise_nom: '',
          siren: row.siren ?? '',
          code_naf: row.naf_code ?? '',
          libelle_naf: '',
          date_creation: '',
          tranche_effectifs: '',
          adresse: '',
          code_postal: '',
          ville: '',
          departement: row.departement ?? '',
          dirigeant_nom: row.nom,
          dirigeant_prenom: row.prenom,
          dirigeant_qualite: '',
          linkedin_search_url: '',
          score_initial: score,
        }

    return {
      uid: row.canonical_key,
      raw,
      enrichment_data: (row.extended_data ?? {}) as ProspectEnrichmentData,
      patrimony_score: score,
      niveau: scoreToNiveau(score),
      raison_principale: row.raison_principale ?? '',
    }
  })
}
