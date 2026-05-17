// POST /api/outreach/extension/action-result
// L'extension reporte le résultat d'un job (invitation envoyée, DM envoyé, etc.).
// Avance l'état de l'enrôlement dans la machine à états.
// Auth: Ext-Key.

import { NextResponse } from 'next/server'
import { authenticateExtension } from '@/lib/supabase/extension'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import type { JobType } from '@/lib/outreach/campaign-helpers'
import type { EnrollmentStatus } from '@/lib/types'

interface ActionResultBody {
  enrollment_id: string
  job_type: JobType
  ok: boolean
  error?: string
  linkedin_url?: string    // retourné par profile_search
  job_title?: string       // retourné par profile_search pour vérification IA
  is_connected?: boolean   // retourné par check_connection
  already_connected?: boolean
}

async function isRelevantProfile(jobTitle: string): Promise<boolean> {
  if (!jobTitle?.trim()) return true // pas de titre = on laisse passer
  try {
    const client = new Anthropic()
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{
        role: 'user',
        content: `Le titre LinkedIn "${jobTitle}" correspond-il à un conseiller en gestion de patrimoine (CGP), family office, ou professionnel de la gestion patrimoniale en France ? Réponds uniquement OUI ou NON.`,
      }],
    })
    const answer = (msg.content[0] as { text: string }).text.trim().toUpperCase()
    return answer.startsWith('OUI')
  } catch {
    return true // en cas d'erreur API, on laisse passer
  }
}

export async function POST(request: Request) {
  const auth = await authenticateExtension(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body: ActionResultBody = await request.json().catch(() => null)
  if (!body?.enrollment_id) return NextResponse.json({ error: 'Missing enrollment_id' }, { status: 400 })

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Vérifier que l'enrôlement appartient bien à cette org
  const { data: enr } = await service
    .from('prospection_campaign_enrollments')
    .select('id, status, current_step, fail_count, prospect_id, campaign:prospection_campaigns(id, status)')
    .eq('id', body.enrollment_id)
    .eq('org_id', auth.org_id)
    .maybeSingle()

  if (!enr) return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })

  const updates: Record<string, unknown> = { last_action_at: new Date().toISOString() }

  if (!body.ok) {
    // Cas spécial : URL LinkedIn 404 = profil supprimé ou introuvable.
    // On conserve le prospect et toute sa donnée d'enrichissement — le CGP
    // pourra retrouver le profil manuellement ou via une future campagne.
    // On nullifie linkedin_url (URL morte) et on marque crm_stage='linkedin_404'
    // pour filtrer facilement dans l'UI. L'enrôlement passe à 'failed'.
    if (body.error === 'profile_not_found_404') {
      await service
        .from('prospection_prospects')
        .update({ crm_stage: 'linkedin_404', linkedin_url: null })
        .eq('id', enr.prospect_id)
      await service
        .from('prospection_campaign_enrollments')
        .update({ status: 'failed', last_action_at: new Date().toISOString() })
        .eq('id', body.enrollment_id)
      await logActivity(
        service,
        enr,
        `⚠️ Profil LinkedIn introuvable (404) — URL nullifiée, prospect conservé`,
        auth.org_id
      )
      return NextResponse.json({ ok: true, prospect_flagged: true })
    }

    // Cas spécial : quota mensuel LinkedIn atteint. C'est une limite du COMPTE,
    // pas un échec du prospect. On ne pénalise pas l'enrôlement (fail_count
    // inchangé, status pending) — la search sera retentée au prochain cycle,
    // ce qui permet de constater si la limite tient vraiment.
    if (body.error === 'search_quota_exceeded' && body.job_type === 'profile_search') {
      await service
        .from('prospection_campaign_enrollments')
        .update({ last_action_at: new Date().toISOString() })
        .eq('id', body.enrollment_id)

      await logActivity(
        service,
        enr,
        `🚫 Quota search LinkedIn atteint sur ce profil — on tente le suivant`,
        auth.org_id
      )
      return NextResponse.json({ ok: true, quota_hit: true })
    }

    const newFailCount = (enr.fail_count ?? 0) + 1
    updates.fail_count = newFailCount
    if (newFailCount >= 3) updates.status = 'failed'
    await service.from('prospection_campaign_enrollments').update(updates).eq('id', body.enrollment_id)

    // Log dans prospect_activity
    await logActivity(service, enr, `❌ ${body.job_type} échoué: ${body.error ?? 'erreur inconnue'}`, auth.org_id)
    return NextResponse.json({ ok: true })
  }

  // Succès — faire avancer l'état
  switch (body.job_type) {
    case 'profile_search':
      if (body.linkedin_url) {
        const relevant = await isRelevantProfile(body.job_title ?? '')
        if (!relevant) {
          updates.status = 'opted_out' as EnrollmentStatus
          updates.fail_count = (enr.fail_count ?? 0) + 1
        } else {
          updates.linkedin_url_resolved = body.linkedin_url
          updates.status = 'profile_search' as EnrollmentStatus
          await service
            .from('prospection_prospects')
            .update({ linkedin_url: body.linkedin_url })
            .eq('id', enr.prospect_id)
            .is('linkedin_url', null)
        }
      } else {
        updates.status = 'opted_out' as EnrollmentStatus
        updates.fail_count = (enr.fail_count ?? 0) + 1
      }
      break

    case 'send_invitation':
      if (body.already_connected) {
        updates.status = 'connected' as EnrollmentStatus
        updates.current_step = 2  // sauter le step invitation, aller au premier DM
      } else {
        updates.status = 'invitation_sent' as EnrollmentStatus
        // Figer la vraie date d'envoi (jamais mise à jour ensuite, contrairement
        // à last_action_at qui sera réécrit par les check_connection)
        updates.invitation_sent_at = new Date().toISOString()
      }
      break

    case 'check_connection':
      if (body.is_connected || body.already_connected) {
        updates.status = 'connected' as EnrollmentStatus
        updates.current_step = (enr.current_step ?? 1) + 1
        // Avancer le crm_stage du prospect
        await service
          .from('prospection_prospects')
          .update({ crm_stage: 'contacted' })
          .eq('id', enr.prospect_id)
          .in('crm_stage', ['to_contact', 'new'])
      }
      // Sinon on reste invitation_sent, on revérifiera plus tard
      break

    case 'send_dm': {
      const nextStep = (enr.current_step ?? 1) + 1
      updates.current_step = nextStep
      // Vérifier s'il y a d'autres steps
      const { data: nextStepRow } = await service
        .from('prospection_campaign_steps')
        .select('id')
        .eq('campaign_id', (enr.campaign as unknown as Record<string, unknown>)?.id)
        .eq('position', nextStep)
        .maybeSingle()

      updates.status = nextStepRow ? ('connected' as EnrollmentStatus) : ('dm_sent' as EnrollmentStatus)
      break
    }
  }

  await service.from('prospection_campaign_enrollments').update(updates).eq('id', body.enrollment_id)

  // Log dans prospect_activity
  const kindMap: Record<string, string> = {
    profile_search: `🔍 Profil LinkedIn trouvé: ${body.linkedin_url ?? ''}`,
    send_invitation: '📨 Invitation LinkedIn envoyée',
    check_connection: body.is_connected ? '✅ Connexion acceptée' : '⏳ Invitation en attente',
    send_dm: '💬 Message LinkedIn envoyé',
  }
  await logActivity(service, enr, kindMap[body.job_type] ?? body.job_type, auth.org_id)

  return NextResponse.json({ ok: true })
}


async function logActivity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  service: any,
  enr: Record<string, unknown>,
  body: string,
  org_id: string
) {
  await service.from('prospection_prospect_activity').insert({
    prospect_id: enr.prospect_id,
    org_id,
    kind: 'linkedin_message',
    body,
  })
}
