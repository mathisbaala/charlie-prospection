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

  // Utilise la fonction SECURITY DEFINER qui override le statement_timeout à 30s
  // (le client REST Supabase est limité à ~3s par le free tier — ORDER BY sur 5k+ rows timeout)
  const { data, error } = await supabase.rpc('search_persons_by_criteria', {
    p_naf_codes: filters.nafCodes ?? null,
    p_person_types: filters.personTypes ?? null,
    p_departements: filters.departements ?? null,
    p_limit: limit,
  })
  if (error || !data) return []

  type Row = {
    canonical_key: string
    prenom: string | null
    nom: string | null
    siren: string | null
    departement: string | null
    naf_code: string | null
    person_type: string | null
    raw_data: unknown
    extended_data: unknown
    patrimony_score: number | null
    raison_principale: string | null
  }

  return (data as Row[]).map((row) => {
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
