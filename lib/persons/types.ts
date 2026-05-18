export type PersonType =
  | 'dirigeant'
  // ── Santé — professions médicales ─────────────────────────────────────────
  | 'médecin'
  | 'dentiste'
  | 'pharmacien'
  | 'kiné'
  | 'biologiste_médical'
  | 'sage_femme'
  | 'infirmier'
  | 'orthophoniste'
  | 'podologue'
  | 'ergothérapeute'
  | 'opticien'
  | 'orthoptiste'
  | 'audioprothésiste'
  // ── Droit ─────────────────────────────────────────────────────────────────
  | 'avocat'
  | 'notaire'
  | 'huissier'
  | 'greffier'
  | 'expert_judiciaire'
  | 'commissaire_priseur'
  | 'commissaire_aux_comptes'
  | 'expert_comptable'
  | 'conseil_pi'
  // ── Finance & assurance ────────────────────────────────────────────────────
  | 'conseiller_financier'
  | 'courtier_assurance'
  // ── Libéraux divers ───────────────────────────────────────────────────────
  | 'architecte'
  | 'vétérinaire'
  | 'géomètre'
  | 'ostéopathe'
  | 'psychologue'
  | 'agent_immobilier'
  // ── Fallback résiduel ─────────────────────────────────────────────────────
  | 'autre_libéral'
  | 'autre'

// Modèle 3 étapes :
//   raw      → collecte brute (ingest RPPS/AE/Sirene)
//   standard → enrichi 24h après insertion (Pappers std + BODACC léger, sans Claude)
//   deep     → enrichi complet pour prospects en suivi (Pappers premium + Claude)
//   dropped  → écarté à la qualification (qualité insuffisante)
//
// Règle invariante : deep est persistant cross-org. Un profil deep ne peut pas
// rétrograder vers standard ou raw.
export type PersonEnrichmentLevel = 'raw' | 'standard' | 'deep' | 'dropped'

export interface Person {
  id: string
  canonical_key: string
  prenom: string
  nom: string
  annee_naissance: number | null
  person_type: PersonType
  profession_libelle: string | null
  rpps_number: string | null
  siren: string | null
  siret: string | null
  naf_code: string | null
  naf_libelle: string | null
  entreprise_nom: string | null
  departement: string | null
  ville: string | null
  adresse: string | null
  code_postal: string | null
  linkedin_url: string | null
  ingest_sources: string[]
  raw_data: Record<string, unknown> | null
  extended_data: Record<string, unknown> | null
  patrimony_score: number | null
  raison_principale: string | null
  enrichment_level: PersonEnrichmentLevel
  enriched_at: string | null
  created_at: string
  updated_at: string
}

/** Input minimal pour POST /api/admin/ingest/persons */
export interface PersonIngestInput {
  prenom: string
  nom: string
  person_type?: PersonType
  annee_naissance?: number
  profession_libelle?: string
  rpps_number?: string
  siren?: string
  siret?: string
  naf_code?: string
  naf_libelle?: string
  entreprise_nom?: string
  departement?: string
  ville?: string
  adresse?: string
  code_postal?: string
  linkedin_url?: string
  /** Source d'alimentation (ex: 'rpps_csv', 'pappers_bulk', 'scraping_linkedin') */
  source: string
}
