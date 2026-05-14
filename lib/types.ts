export type Plan = 'starter' | 'pro'
export type OrgRole = 'owner' | 'member'
export type CrmStage = 'new' | 'to_contact' | 'contacted' | 'meeting' | 'client' | 'lost'
export type SignalType =
  | 'cession_entreprise' | 'levee_fonds' | 'creation_holding' | 'transaction_immo'
  | 'nouveau_poste' | 'installation_cabinet' | 'post_linkedin' | 'retraite_imminente'
  | 'divorce' | 'succession' | 'augmentation_capital'
export type SignalSource = 'bodacc' | 'sirene' | 'dvf' | 'rpps' | 'jo' | 'linkedin' | 'infogreffe'
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

export interface ParsedIcpCriteria {
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
