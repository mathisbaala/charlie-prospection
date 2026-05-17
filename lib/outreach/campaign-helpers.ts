// Calcule les jobs que l'extension doit exécuter maintenant pour une org donnée.
// Un "job" = une action concrète sur un profil LinkedIn (chercher URL, envoyer invitation,
// vérifier connexion, envoyer DM, etc.).

import type { CampaignStep, EnrollmentStatus } from '@/lib/types'
import { renderTemplate, extractTemplateVars } from './message-renderer'
import type { Prospect } from '@/lib/types'

export type JobType =
  | 'profile_search'
  | 'send_invitation'
  | 'check_connection'
  | 'send_dm'

export interface ExtensionJob {
  enrollment_id: string
  campaign_id: string
  prospect_id: string
  type: JobType
  first_name?: string
  last_name?: string
  company?: string
  city?: string
  profile_url?: string
  note?: string
  message?: string
}

interface EnrollmentRow {
  id: string
  campaign_id: string
  prospect_id: string
  status: EnrollmentStatus
  current_step: number
  linkedin_url_resolved: string | null
  last_action_at: string | null
  fail_count: number
  prospect: Prospect | null
  steps: CampaignStep[]
}

const DEFAULT_LIMITS: Record<JobType, number> = {
  profile_search: 200,
  send_invitation: 30,   // LinkedIn safe limit
  check_connection: 100,
  send_dm: 50,
}

export interface DailyLimits {
  profile_search?: number
  send_invitation?: number
  check_connection?: number
  send_dm?: number
}

const MAX_INVITATION_WAIT_DAYS = 21  // abandon si pas de réponse après 21j
const MAX_FAIL_COUNT = 3

export function computeJobs(enrollments: EnrollmentRow[], customLimits: DailyLimits = {}): ExtensionJob[] {
  const limits: Record<JobType, number> = {
    profile_search: customLimits.profile_search ?? DEFAULT_LIMITS.profile_search,
    send_invitation: customLimits.send_invitation ?? DEFAULT_LIMITS.send_invitation,
    check_connection: customLimits.check_connection ?? DEFAULT_LIMITS.check_connection,
    send_dm: customLimits.send_dm ?? DEFAULT_LIMITS.send_dm,
  }
  const counts: Record<JobType, number> = {
    profile_search: 0,
    send_invitation: 0,
    check_connection: 0,
    send_dm: 0,
  }

  const jobs: ExtensionJob[] = []
  const now = Date.now()

  for (const enr of enrollments) {
    if (enr.fail_count >= MAX_FAIL_COUNT) continue

    const job = resolveJob(enr, now, counts, limits)
    if (!job) continue

    counts[job.type]++
    if (counts[job.type] > limits[job.type]) continue

    jobs.push(job)
  }

  return jobs
}

function resolveJob(
  enr: EnrollmentRow,
  now: number,
  counts: Record<JobType, number>,
  limits: Record<JobType, number>
): ExtensionJob | null {
  const base = { enrollment_id: enr.id, campaign_id: enr.campaign_id, prospect_id: enr.prospect_id }

  switch (enr.status) {
    case 'pending': {
      if (counts.profile_search >= limits.profile_search) return null
      const e = (enr.prospect?.enrichment_data ?? {}) as Record<string, unknown>
      const ld = (enr.prospect?.linkedin_data ?? {}) as Record<string, unknown>
      const firstName = String(e.dirigeant_prenom ?? ld.prenom ?? '').trim()
      const lastName = String(e.dirigeant_nom ?? ld.nom ?? '').trim()
      if (!firstName && !lastName) return null
      const company = String(e.entreprise_nom ?? '').trim() || undefined
      const city = String(e.ville ?? '').trim() || undefined
      return { ...base, type: 'profile_search', first_name: firstName, last_name: lastName, company, city }
    }

    case 'profile_search': {
      // URL found externally — now send invitation
      if (!enr.linkedin_url_resolved) return null
      if (counts.send_invitation >= limits.send_invitation) return null
      const step = enr.steps.find(s => s.position === 1)
      const note = step?.template
        ? renderTemplate(step.template, extractTemplateVars(enr.prospect!))
        : undefined
      return { ...base, type: 'send_invitation', profile_url: enr.linkedin_url_resolved, note }
    }

    case 'invitation_sent': {
      if (!enr.linkedin_url_resolved) return null
      if (counts.check_connection >= limits.check_connection) return null
      // Don't re-check too soon (min 1 day wait)
      const lastMs = enr.last_action_at ? new Date(enr.last_action_at).getTime() : 0
      if (now - lastMs < 24 * 60 * 60 * 1000) return null
      // Abandon after MAX_INVITATION_WAIT_DAYS
      if (now - lastMs > MAX_INVITATION_WAIT_DAYS * 24 * 60 * 60 * 1000) return null
      return { ...base, type: 'check_connection', profile_url: enr.linkedin_url_resolved }
    }

    case 'connected': {
      if (!enr.linkedin_url_resolved || !enr.prospect) return null
      const nextStep = enr.steps.find(s => s.position === enr.current_step)
      if (!nextStep || nextStep.type !== 'message') return null
      if (counts.send_dm >= limits.send_dm) return null
      // Respect delay_days since last action
      const lastMs = enr.last_action_at ? new Date(enr.last_action_at).getTime() : 0
      const waitMs = nextStep.delay_days * 24 * 60 * 60 * 1000
      if (now - lastMs < waitMs) return null
      const message = renderTemplate(nextStep.template, extractTemplateVars(enr.prospect))
      return { ...base, type: 'send_dm', profile_url: enr.linkedin_url_resolved, message }
    }

    default:
      return null
  }
}

// Templates par défaut pour une campagne CGP
export const DEFAULT_STEPS: Omit<CampaignStep, 'id' | 'campaign_id' | 'org_id' | 'created_at'>[] = [
  {
    position: 1,
    type: 'invitation',
    delay_days: 0,
    template:
      "Bonjour {{firstName}},\n\nJ'ai remarqué votre profil et aimerais échanger avec vous sur la gestion de patrimoine. Votre activité chez {{company}} m'a particulièrement intéressé.\n\nCordialement",
  },
  {
    position: 2,
    type: 'message',
    delay_days: 3,
    template:
      "Bonjour {{firstName}},\n\nMerci pour votre connexion ! Je souhaitais vous présenter Charlie, notre outil d'intelligence patrimoniale pour CGP indépendants.\n\nSeriez-vous disponible pour un échange de 20 minutes cette semaine ?\n\nCordialement",
  },
  {
    position: 3,
    type: 'message',
    delay_days: 10,
    template:
      "Bonjour {{firstName}},\n\nJe me permets de relancer — avez-vous eu l'occasion de consulter mon message précédent ?\n\nBonne journée",
  },
]
