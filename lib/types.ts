import type { PappersPremiumData } from '@/lib/data-sources/pappers'
import type { LiberalDirectoryUrls } from '@/lib/data-sources/professional-directories'
import type { DvfPersoCandidate } from '@/lib/data-sources/dvf'
import type { InfogreffeLink } from '@/lib/data-sources/infogreffe'

export type { PappersPremiumData, LiberalDirectoryUrls, DvfPersoCandidate, InfogreffeLink }
export type Plan = 'starter' | 'pro'
export type ProspectSource =
  | 'pappers'
  | 'annuaire_entreprises'
  | 'bodacc_cessions'
  | 'rpps'
  | 'inpi_rne'
  | 'rne_elus'
  | 'sirene_creations'
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

/**
 * Per-criterion strict flag. When `true`, the search engine weights that
 * criterion as a strong multiplier on the score (soft ranking, no hard
 * exclusion — owner's decision). Keys are field names from ParsedIcpCriteria.
 */
export type StrictFilters = Partial<Record<keyof ParsedIcpCriteria, boolean>>

export interface Icp {
  id: string
  org_id: string
  /** Human-friendly persona name shown in /cible. Migration 20260516000000
   *  backfilled this from raw_description for existing rows. */
  name: string
  raw_description: string
  parsed_criteria: ParsedIcpCriteria
  /** Per-criterion strict flag — see StrictFilters. */
  strict_filters: StrictFilters
  linkedin_queries: string[]
  status: IcpStatus
  created_at: string
  updated_at: string
  /** Optional decoration computed by list endpoints / page server queries —
   *  number of /suivi prospects attached. Surfaces in PersonaList badges
   *  and the delete-confirm dialog. Not stored in DB. */
  prospect_count?: number
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
  // Aligned with InboxEventType (Agent 3) so we keep one event taxonomy across
  // the per-SIREN fiche enrichment and the firehose-ingested signals inbox.
  type: InboxEventType
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

/** Une entité juridique annexe au dirigeant — SCI, holding, autre société.
 *  Voir lib/enrichment/personal-portfolio.ts pour les heuristiques de
 *  catégorisation. */
export interface EntitySummary {
  siren: string
  nom_entreprise: string
  code_naf?: string
  libelle_code_naf?: string
  date_creation?: string
  ville?: string
  category: 'sci' | 'sccv' | 'holding' | 'principale' | 'societe_active' | 'autre'
}

/** Portefeuille patrimonial du dirigeant — agrégation des entités juridiques
 *  rattachées (incl. la principale). Voir lib/enrichment/personal-portfolio.ts */
export interface PersonalPortfolio {
  total_entites: number
  nb_sci: number
  nb_holding: number
  nb_societes_actives: number
  entites: EntitySummary[]
  niveau_structuration: 'none' | 'simple' | 'structuré' | 'sophistiqué'
}

/** Dérivées calculées sur la séquence FinanceYear[] — voir
 *  lib/enrichment/finance-derivatives.ts pour le détail des champs. */
export interface FinanceDerivatives {
  ca_growth_yoy: number | null
  ca_growth_3y_cagr: number | null
  ca_trajectory: 'growth' | 'stable' | 'decline' | 'volatile' | 'unknown'
  marge_ebitda_delta_pts: number | null
  resultat_growth_yoy: number | null
  fonds_propres_growth_pct: number | null
  debt_to_equity: number | null
  effectif_delta_3y: number | null
  years_available: number
  latest_year: number | null
}

export interface CeremaHolding {
  siren: string
  entite_nom: string
  adresse: string
  type_local?: string
  surface_bati?: number
  date_achat: string           // ISO date "YYYY-MM-DD"
  prix_achat: number
  id_parcelle?: string
  confidence: 'high' | 'medium' | 'low'
  statut: 'detenu' | 'vendu'
}

export interface PatrimoineImmo {
  holdings: CeremaHolding[]        // detenu + vendu — l'UI filtre
  nb_biens_estimes: number         // count(statut='detenu')
  derniere_transaction?: string    // ISO date
  valeur_comptable_totale?: number // future: sum immobilisations bilans Pappers
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

  /**
   * Candidats DVF matching l'adresse du siège — best-effort, JAMAIS utilisé
   * dans le scoring patrimonial (DVF n'a pas le SIREN du propriétaire, on
   * matche juste par adresse-siège, donc bruyant). Affiché dans la fiche
   * avec un niveau de confiance explicite pour que le CGP juge.
   * Voir lib/data-sources/dvf.ts → getDvfByAddress.
   */
  dvf_perso_candidates?: DvfPersoCandidate[]

  // Facteurs dérivés pour le scoring
  potentiel_rpps?: PotentielRppsNiveau

  // LinkedIn indirect
  linkedin_search_url?: string
  linkedin_titre?: string

  // Dérivées finance calculées (croissance, marge trend, D/E…)
  // Voir lib/enrichment/finance-derivatives.ts
  finance_derivatives?: FinanceDerivatives

  // Portefeuille d'entités juridiques du dirigeant (SCI / holdings / autres
  // sociétés). Signal patrimonial fort pour un CGP qui démarche des
  // personnes physiques, pas des sociétés.
  // Voir lib/enrichment/personal-portfolio.ts
  personal_portfolio?: PersonalPortfolio

  // Données Premium Pappers — populé uniquement quand PAPPERS_PREMIUM_ENABLED=1
  // et qu'on appelle getPappersEnrichment(siren, { premium: true }).
  // Coût : 1 jeton Pappers (même coût que l'enrichissement standard, les
  // flags Premium n'ajoutent que des champs à la réponse).
  // Voir lib/data-sources/pappers.ts → PappersPremiumData.
  pappers_premium?: PappersPremiumData

  // Patrimoine immobilier du dirigeant (Cerema DV3F, BODACC holdings)
  // Enrichissement patrimonial détaillé des biens immobiliers détenus.
  // Voir lib/data-sources/cerema.ts et lib/enrichment/patrimoine-immo.ts.
  patrimoine_immo?: PatrimoineImmo

  // URLs pré-remplies vers les annuaires officiels des professions libérales
  // non-santé (avocats CNB, notaires, experts-comptables). Pas de scraping —
  // les sites ont du anti-bot. Même pattern que rpps.doctolib_search_url.
  // Voir lib/data-sources/professional-directories.ts.
  liberal_directory_urls?: LiberalDirectoryUrls

  // Deep-link Infogreffe (source officielle des greffes). Populé dès qu'on
  // a un SIREN valide. `is_fallback=true` quand Pappers n'a pas répondu —
  // l'UI surface alors ce lien en CTA principal de vérification.
  // Voir lib/data-sources/infogreffe.ts.
  infogreffe?: InfogreffeLink

  // INPI RNE — actes complets par SIREN (statuts, PV AGO, cessions de parts,
  // modifications de capital). Source primaire INPI : certains actes ne
  // remontent pas chez Pappers. Populé uniquement à la mise en suivi.
  // Voir lib/data-sources/inpi-rne-company.ts.
  actes_rne?: ActeRne[]

  // Transparence Santé — avantages reçus par les professionnels de santé
  // (repas, congrès, honoraires expertise). Signal KOL = revenus complémentaires.
  // Gratuit, open data. Populé uniquement pour les professions de santé.
  // Voir lib/data-sources/transparence-sante.ts.
  avantages_sante?: AvantageTransparence[]

  // Presse économique — mentions dans Les Echos, BFM, Capital, Challenges, etc.
  // Signal : levée de fonds, cession, nomination → timing appointment.
  // Nécessite NEWS_API_KEY. Populé uniquement à la mise en suivi.
  // Voir lib/data-sources/news.ts.
  mentions_presse?: MentionPresse[]

  // LinkedIn profile enrichi via Proxycurl (parcours, ancienneté, diplômes).
  // Nécessite PROXYCURL_API_KEY + URL de profil réelle (linkedin.com/in/...).
  // Voir lib/data-sources/proxycurl.ts.
  linkedin_profile?: LinkedinProfileEnriched

  // Marques et brevets EUIPO (EU) + INPI (FR si INPI_API_TOKEN).
  // Signal : IP détenue = valeur immatérielle hors bilan.
  // Voir lib/data-sources/euipo-marques.ts.
  marques_deposees?: MarqueDeposee[]

  // BALO — dividendes distribués publiés au Journal Officiel.
  // Signal : société ayant versé 500k€+ de dividendes = liquidités chez le dirigeant.
  // Nécessite PISTE_CLIENT_ID + PISTE_CLIENT_SECRET. Surtout pertinent pour
  // sociétés cotées ou ayant +100 actionnaires (PME privées → Pappers Premium).
  // Voir lib/data-sources/balo.ts.
  dividendes_balo?: DividendeBalo[]

  // Societe.com — score de crédit et incidents de paiement de l'entreprise.
  // Signal : risque faible = dirigeant en position de force ; incidents = éviter.
  // Nécessite SOCIETECOM_API_KEY. Voir lib/data-sources/societecom.ts.
  credit_entreprise?: CreditEntreprise

  // Crunchbase — levées de fonds (startup/tech uniquement).
  // Signal : série B/C = exit probable dans 3-5 ans = liquidité future.
  // Nécessite CRUNCHBASE_API_KEY. Voir lib/data-sources/crunchbase.ts.
  donnees_startup?: DonneesStartup

  // Cadastre IGN — parcelles à l'adresse du siège (gratuit, sans propriétaire).
  // Voir lib/data-sources/cadastre.ts.
  cadastre_parcelles?: ParcelleIgn[]

  // Foncier Innovant — biens immobiliers détenus par le dirigeant (par nom).
  // Signal : résidences secondaires détectées = patrimoine immobilier constitué.
  // Nécessite FONCIER_INNOVANT_API_KEY (~200-500€/mois).
  // Voir lib/data-sources/cadastre.ts.
  proprietes_foncier?: ProprieteFoncier[]

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

// ── Types des nouvelles sources d'enrichissement profond ─────────────────────

export interface ActeRne {
  id: string
  date: string
  type: string
  libelle: string
  documents?: Array<{ url: string; nom: string }>
}

export interface AvantageTransparence {
  date: string
  entreprise: string
  montant_ttc?: number
  nature_lien: string
  objet?: string
}

export interface MentionPresse {
  date: string
  titre: string
  source: string
  url: string
  extrait?: string
}

export interface LinkedinProfileEnriched {
  full_name?: string
  headline?: string
  summary?: string
  current_company?: string
  current_position?: string
  location?: string
  education?: Array<{
    school: string
    degree?: string
    field?: string
    year_end?: number
  }>
  experiences?: Array<{
    company: string
    title: string
    duration_years?: number
  }>
  connections?: number
  profile_url: string
}

export interface MarqueDeposee {
  numero: string
  denomination: string
  statut: string
  date_depot: string
  date_expiration?: string
  classes?: string[]
  titulaire: string
  source: 'euipo' | 'inpi'
}

export interface DividendeBalo {
  date_publication: string
  entreprise: string
  montant_par_action?: number
  date_mise_en_paiement?: string
  resume?: string
}

export interface CreditEntreprise {
  score_credit?: number
  risque?: 'faible' | 'moyen' | 'eleve' | 'tres_eleve'
  incidents_paiement?: number
  encours_client_estime?: number
  probabilite_defaillance?: number
  source: 'societecom'
}

export interface LeveeFonds {
  date: string
  serie: string
  montant_usd?: number
  investisseurs: string[]
  valorisation_post_money?: number
}

export interface DonneesStartup {
  levees: LeveeFonds[]
  total_leve_usd?: number
  nb_levees?: number
  derniere_levee_date?: string
  derniere_levee_serie?: string
  investisseurs_principaux?: string[]
}

export interface ParcelleIgn {
  parcelle_id: string
  section: string
  numero: string
  surface_m2?: number
  code_commune: string
  adresse_approximative?: string
}

export interface ProprieteFoncier {
  parcelle_id: string
  adresse?: string
  surface_m2?: number
  valeur_venale_estimee?: number
  date_derniere_transaction?: string
  type_bien?: string
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

// ── Signals inbox (Agent 3 — signal-first) ─────────────────────────────────

export type InboxSource = 'bodacc' | 'sirene' | 'inpi' | 'pappers_modif'

export type InboxEventType =
  | 'cession'
  | 'creation'
  | 'radiation'
  | 'modification'
  | 'procedure_collective'
  | 'modif_capital'
  | 'modif_beneficiaire'
  | 'depot_comptes'
  | 'autre'

export interface SignalsInboxRow {
  id: string
  source: InboxSource
  external_id: string
  date_event: string
  siren: string | null
  entreprise_nom: string | null
  code_naf: string | null
  departement: string | null
  type_event: InboxEventType
  raw_data: Record<string, unknown>
  matched_org_ids: string[]
  ingested_at: string
}

// Row used at insert time (no id / ingested_at yet)
export type SignalsInboxInsert = Omit<SignalsInboxRow, 'id' | 'ingested_at' | 'matched_org_ids'> & {
  matched_org_ids?: string[]
}

// ── Activity log per prospect (Round 10) ───────────────────────────────────

export type ActivityKind =
  | 'note'
  | 'call'
  | 'email_sent'
  | 'linkedin_message'
  | 'meeting'
  | 'other'

export interface ProspectActivity {
  id: string
  prospect_id: string
  org_id: string
  kind: ActivityKind
  body: string
  occurred_at: string
  created_by: string | null
  created_at: string
}

// ── Recherche tab — ephemeral search candidates (PR 3) ──────────────────────
//
// SearchCandidate is the unit returned by POST /api/recherche/run. It carries
// the full enriched blob round-trip to the client so that POST /api/suivi/add
// can persist exactly what the user previewed, without any server-side cache
// or "search results" table. Stays out of the DB until the user explicitly
// adds it to /suivi.
export interface SearchCandidate {
  /** Stable key for client-side selection (= raw.uid). */
  uid: string
  raw: {
    uid: string
    source: ProspectSource
    source_type: 'personne_morale' | 'personne_physique'
    entreprise_nom: string
    siren: string
    code_naf: string
    libelle_naf: string
    date_creation: string
    tranche_effectifs: string
    adresse: string
    code_postal: string
    ville: string
    departement: string
    dirigeant_nom: string
    dirigeant_prenom: string
    dirigeant_qualite: string
    dirigeant_annee_naissance?: number
    linkedin_search_url: string
    score_initial: number
  }
  enrichment_data: ProspectEnrichmentData
  patrimony_score: number
  icp_score: number
  niveau: 'faible' | 'moyen' | 'fort' | 'prioritaire'
  raison_principale: string
  /** True if a prospect with this linkedin_search_url already exists in the
   *  org's /suivi (so the UI can disable the "Ajouter" button). */
  already_in_suivi: boolean
}
