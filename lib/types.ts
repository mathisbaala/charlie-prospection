export type Plan = 'starter' | 'pro'
export type OrgRole = 'owner' | 'member'
export type CrmStage = 'new' | 'to_contact' | 'contacted' | 'meeting' | 'client' | 'lost'
export type SignalType =
  | 'cession_entreprise' | 'levee_fonds' | 'creation_holding' | 'transaction_immo'
  | 'nouveau_poste' | 'installation_cabinet' | 'post_linkedin' | 'retraite_imminente'
  | 'divorce' | 'succession' | 'augmentation_capital'
export type SignalSource = 'bodacc' | 'sirene' | 'dvf' | 'rpps' | 'jo' | 'linkedin' | 'infogreffe' | 'pappers'
export type OutreachChannel = 'linkedin' | 'email'
export type OutreachStatus = 'draft' | 'approved' | 'sent' | 'replied'
export type IcpStatus = 'active' | 'paused'

export interface Organization {
  id: string
  name: string
  slug: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  plan: Plan
  created_at: string
}

export interface OrganizationMember {
  id: string
  org_id: string
  user_id: string
  role: OrgRole
  created_at: string
}

export type TargetType = 'personne_morale' | 'personne_physique' | 'both'

export interface ParsedIcpCriteria {
  target_type?: TargetType
  roles: string[]
  sectors: string[]
  locations: string[]
  seniority_min_years?: number
  patrimony_level?: 'standard' | 'high' | 'very_high'
  keywords: string[]
  signal_priorities: SignalType[]
}

export interface Icp {
  id: string
  org_id: string
  raw_description: string
  parsed_criteria: ParsedIcpCriteria
  linkedin_queries: string[]
  status: IcpStatus
  created_at: string
  updated_at: string
}

export interface Prospect {
  id: string
  org_id: string
  icp_id: string | null
  linkedin_url: string
  linkedin_data: Record<string, unknown>
  enrichment_data: Record<string, unknown>
  patrimony_score: number | null
  icp_score: number | null
  crm_stage: CrmStage
  created_at: string
  last_signal_at: string | null
}

export interface Signal {
  id: string
  prospect_id: string
  org_id: string
  type: SignalType
  source: SignalSource
  data: Record<string, unknown>
  valeur_estimee: number | null
  detected_at: string
  read: boolean
}

export interface OutreachMessage {
  id: string
  prospect_id: string
  org_id: string
  channel: OutreachChannel
  content: string
  signals_used: string[]
  status: OutreachStatus
  sent_at: string | null
  created_at: string
}

// ── Enrichissement prospect ────────────────────────────────────────────────

export interface BodaccEvent {
  id: string
  date: string
  type: 'cession' | 'creation' | 'radiation' | 'modification' | 'procedure_collective' | 'autre'
  libelle: string
  source: 'bodacc'
}

export interface DvfTransaction {
  id: string
  date_mutation: string
  nature_mutation: string
  valeur_fonciere: number
  type_local: string
  surface_reelle_bati?: number
  adresse: string
  commune: string
}

export interface FinanceYear {
  annee: number
  chiffre_affaires?: number
  resultat?: number
  marge_brute?: number
  excedent_brut_exploitation?: number
  taux_marge_EBITDA?: number
  taux_croissance_chiffre_affaires?: number
  fonds_propres?: number
  rentabilite_fonds_propres?: number
  dettes_financieres?: number
  capacite_autofinancement?: number
  effectif?: number | null
}

export interface BeneficiaireEffectif {
  nom?: string
  prenom?: string
  pourcentage_parts?: number
  pourcentage_votes?: number
  nationalite?: string
  date_de_naissance?: string
}

export interface RppsData {
  identifiant?: string
  profession?: string
  categorie_professionnelle?: string
  mode_exercice?: string
  type_activite_liberale?: string
  savoir_faire?: string
  cabinet_nom?: string
  cabinet_commune?: string
  cabinet_code_postal?: string
  cabinet_adresse?: string
  doctolib_search_url?: string
}

export interface ProspectEnrichmentData {
  // Identité dirigeant
  dirigeant_nom?: string
  dirigeant_prenom?: string
  dirigeant_qualite?: string
  dirigeant_annee_naissance?: number

  // Entreprise (SIRENE)
  siren?: string
  siret?: string
  forme_juridique?: string
  date_creation_entreprise?: string
  code_naf?: string
  libelle_naf?: string
  tranche_effectifs?: string
  adresse_entreprise?: string
  code_postal?: string
  ville?: string
  departement?: string

  // Pappers — finances & gouvernance
  finances?: FinanceYear[]
  chiffre_affaires_dernier?: number
  resultat_dernier?: number
  taux_marge_dernier?: number
  fonds_propres_dernier?: number
  capital_social?: number
  beneficiaires_effectifs?: BeneficiaireEffectif[]
  procedure_collective_en_cours?: boolean
  date_immatriculation_rcs?: string
  greffe?: string
  numero_tva?: string
  nb_etablissements?: number

  // RPPS (professionnels de santé)
  rpps?: RppsData

  // Signaux BODACC
  bodacc_events?: BodaccEvent[]

  // Transactions immobilières (DVF) — contexte marché, jamais patrimoine personnel
  dvf_transactions?: DvfTransaction[]
  /**
   * Contexte du marché immobilier local (médiane de la zone du siège).
   * Indicateur de zone, PAS le patrimoine immobilier du dirigeant.
   */
  contexte_marche_immo_local?: ContexteMarcheImmoLocal

  // Facteurs dérivés pour le scoring
  potentiel_rpps?: PotentielRppsNiveau

  // LinkedIn indirect
  linkedin_search_url?: string
  linkedin_titre?: string

  // Scores calculés
  valeur_entreprise_estimee?: number
  revenus_implicites_estimes?: number
  patrimoine_total_estime?: number
  score_breakdown?: PatrimonyScoreBreakdown
  facteurs_cles?: string[]

  // Métadonnées
  sources_utilisees?: string[]
  enrichi_le?: string
}

export interface ProspectSearchResult {
  linkedin_url: string
  linkedin_data: Record<string, unknown>
  enrichment_data: ProspectEnrichmentData
  patrimony_score: number
  icp_score: number
  signals_detected: Array<{
    type: SignalType
    source: SignalSource
    data: Record<string, unknown>
    valeur_estimee?: number
    detected_at: string
  }>
}

// ─────────────────────────────────────────────────────────────────────────
// APPEND-ONLY (Agent 1 — feat/identification-fix)
// Augmentation de ParsedIcpCriteria via TypeScript declaration merging :
// seuils financiers, âge, géofiltrage strict. Tous optionnels pour préserver
// le contrat de l'interface existant. Produits par le parser Claude
// (icp-parser.ts) et lus par le moteur de recherche (engine.ts).
// ─────────────────────────────────────────────────────────────────────────

export interface ParsedIcpCriteria {
  /** Chiffre d'affaires minimum en euros, si exprimé dans l'ICP. */
  ca_min?: number
  /** Chiffre d'affaires maximum en euros. */
  ca_max?: number
  /** Effectif salarié minimum. */
  effectif_min?: number
  /** Effectif salarié maximum. */
  effectif_max?: number
  /** Âge minimum du dirigeant. */
  age_min?: number
  /** Âge maximum du dirigeant. */
  age_max?: number
  /**
   * Si true, le moteur n'élargit pas aux départements adjacents.
   * Si false ou non défini (défaut), une "ville pivot" type Lyon → 69 + adjacents.
   */
  geo_strict?: boolean
}

// ── Append: contexte marché immo + scoring breakdown + RPPS potentiel ────────
// (Agent 2 — feat/enrichment-quality)

export interface ContexteMarcheImmoLocal {
  mediane_zone: number
  nb_transactions_zone: number
  ville: string
}

export type PotentielRppsNiveau = 'faible' | 'moyen' | 'fort' | 'tres_fort'

export interface PatrimonyScoreBreakdown {
  patrimoine_professionnel: number // 0-100
  patrimoine_immobilier: number    // 0-100 — patrimoine perso inféré, pas DVF zone
  signaux_liquidite: number        // 0-100
  age_carriere: number             // 0-100
  qualite_donnees: number          // 0-100
}

export interface PatrimonyScoreResult {
  score: number
  breakdown: PatrimonyScoreBreakdown
  facteurs_cles: string[]
  patrimoine_total_estime: number | null
  valeur_entreprise_estimee: number | null
  revenus_implicites_estimes: number | null
  niveau: 'faible' | 'moyen' | 'fort' | 'prioritaire'
  raison_principale: string
}
