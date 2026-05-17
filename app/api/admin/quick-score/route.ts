import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { PersonType } from '@/lib/persons/types'

export const maxDuration = 60

const BATCH = 500

type PersonRow = {
  canonical_key: string
  person_type: PersonType
  profession_libelle: string | null
  departement: string | null
  naf_code: string | null
}

function quickScore(p: PersonRow): { score: number; raison: string } {
  const prof = (p.profession_libelle ?? '').toLowerCase()
  let score = 30
  let raison = 'Libéral'

  switch (p.person_type) {
    case 'médecin':
      if (/chirurg|anesthés|cardio|radiol|ophtalmol|orthop/.test(prof)) {
        score = 82; raison = 'Médecin spécialiste — plateau technique élevé'
      } else if (/spécial|dermato|psychiatr|pédiat|gynécol|neurolog/.test(prof)) {
        score = 72; raison = 'Médecin spécialiste'
      } else {
        score = 56; raison = 'Médecin généraliste'
      }
      break
    case 'dentiste':
      score = 68; raison = 'Chirurgien-dentiste libéral'
      break
    case 'pharmacien':
      score = 65; raison = 'Pharmacien titulaire'
      break
    case 'kiné':
      score = 48; raison = 'Masseur-kinésithérapeute'
      break
    case 'notaire':
      score = 78; raison = 'Notaire — office libéral'
      break
    case 'avocat':
      score = 60; raison = 'Avocat'
      break
    case 'expert_comptable':
      score = 63; raison = 'Expert-comptable'
      break
    case 'conseiller_financier':
      score = 72; raison = 'Conseiller en gestion de patrimoine'
      break
    case 'courtier_assurance':
      score = 55; raison = 'Courtier / agent en assurance'
      break
    case 'huissier':
      score = 70; raison = 'Commissaire de justice'
      break
    case 'autre_libéral':
      if (/commissaire.priseur|enchères/.test(prof)) { score = 76; raison = 'Commissaire-priseur' }
      else if (/vétérin/.test(prof))                 { score = 64; raison = 'Vétérinaire' }
      else if (/architecte/.test(prof))              { score = 58; raison = 'Architecte' }
      else if (/expert judiciaire/.test(prof))       { score = 64; raison = 'Expert judiciaire' }
      else if (/géomètre/.test(prof))                { score = 58; raison = 'Géomètre-expert' }
      else if (/ostéopath/.test(prof))               { score = 46; raison = 'Ostéopathe' }
      else if (/psycholog/.test(prof))               { score = 44; raison = 'Psychologue' }
      else if (/agent immobilier/.test(prof))        { score = 48; raison = 'Agent immobilier' }
      else                                           { score = 44; raison = 'Autre libéral' }
      break
    default:
      score = 34; raison = 'Dirigeant'
  }

  // Bonus géographie
  const d = p.departement ?? ''
  if (['75', '92', '94', '78', '91', '95', '77', '93'].includes(d)) score += 8
  else if (['69', '13', '06', '31', '33', '44', '67', '59', '76'].includes(d)) score += 4

  return { score: Math.min(score, 100), raison: `[quick] ${raison}` }
}

/**
 * POST /api/admin/quick-score
 *
 * Calcule un score patrimonial rapide (sans API externe) pour les personnes
 * sans score. Met à jour patrimony_score + raison_principale sur BATCH entrées.
 * Conserve enrichment_level='raw' pour que le cron Claude les enrichisse ensuite.
 */
export async function POST(request: Request) {
  const key = request.headers.get('x-admin-key')
  if (key !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: persons, error } = await supabase
    .from('prospection_persons')
    .select('canonical_key, person_type, profession_libelle, departement, naf_code')
    .eq('enrichment_level', 'raw')
    .is('patrimony_score', null)
    .limit(BATCH)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!persons || persons.length === 0) return NextResponse.json({ ok: true, scored: 0, done: true })

  const updates = (persons as PersonRow[]).map(p => {
    const { score, raison } = quickScore(p)
    return {
      canonical_key: p.canonical_key,
      patrimony_score: score,
      raison_principale: raison,
      updated_at: new Date().toISOString(),
    }
  })

  const { error: upsertErr } = await supabase
    .from('prospection_persons')
    .upsert(updates, { onConflict: 'canonical_key', ignoreDuplicates: false })

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, scored: updates.length, done: updates.length < BATCH })
}
