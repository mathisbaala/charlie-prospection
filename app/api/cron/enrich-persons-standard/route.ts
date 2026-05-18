// Cron quotidien 08:00 UTC — Enrichissement standard des personnes 'raw' depuis 24h.
//
// Étape 2 du pipeline d'enrichissement :
//   Étape 1 : ingest (scraping/RPPS/AE) → enrichment_level='raw'
//   Étape 2 : ce cron → Pappers standard + BODACC léger + score règles métier → enrichment_level='standard'
//   Étape 3 : /api/suivi/add → deep enrichment + Claude scoring → enrichment_level='deep'
//
// Pas de Claude ici — score purement règles métier sur données collectées.
// Coût : 1 token Pappers par personne avec SIREN. Personnes RPPS sans SIREN : 0 token.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getPappersEnrichment } from '@/lib/data-sources/pappers'
import { getBodaccBySiren } from '@/lib/data-sources/bodacc'
import type { PersonType } from '@/lib/persons/types'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

const BATCH = 50

type PersonRow = {
  canonical_key: string
  person_type: PersonType
  profession_libelle: string | null
  departement: string | null
  code_postal: string | null
  naf_code: string | null
  siren: string | null
  siret: string | null
  rpps_number: string | null
}

// Bonus géographie identique au quick-score pour cohérence
function geoBonus(departement: string | null, codePostal: string | null): number {
  const d = departement ?? ''
  const cp = (codePostal ?? '').trim()

  const CP_PREMIUM: Record<string, number> = {
    '75008': 5, '75016': 5, '75017': 4, '75007': 4, '75006': 4,
    '75001': 3, '75002': 3, '75009': 3, '75015': 2,
    '92200': 5, '92100': 4, '92300': 4, '92400': 3, '92500': 3,
    '94300': 3, '94170': 3, '91300': 3,
    '69006': 4, '69003': 3, '69008': 3,
    '33000': 3, '13008': 4, '13006': 3,
    '06000': 3, '06400': 4, '06600': 3,
    '31000': 2, '67000': 2, '44000': 2,
  }

  let bonus = 0
  if (['75', '92', '94', '78', '91', '95', '77', '93'].includes(d)) bonus += 8
  else if (['69', '13', '06', '31', '33', '44', '67', '59', '76'].includes(d)) bonus += 4
  bonus += CP_PREMIUM[cp] ?? 0
  return bonus
}

// Score de base par profession (identique au quick-score)
function baseScore(p: PersonRow): { score: number; raison: string } {
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
    case 'dentiste':  score = 68; raison = 'Chirurgien-dentiste libéral'; break
    case 'pharmacien': score = 65; raison = 'Pharmacien titulaire'; break
    case 'kiné':      score = 48; raison = 'Masseur-kinésithérapeute'; break
    case 'notaire':   score = 78; raison = 'Notaire — office libéral'; break
    case 'avocat':    score = 60; raison = 'Avocat'; break
    case 'expert_comptable': score = 63; raison = 'Expert-comptable'; break
    case 'conseiller_financier': score = 72; raison = 'Conseiller en gestion de patrimoine'; break
    case 'courtier_assurance':   score = 55; raison = 'Courtier / agent en assurance'; break
    case 'huissier':  score = 70; raison = 'Commissaire de justice'; break
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
    default: score = 34; raison = 'Dirigeant'
  }

  return { score, raison }
}

// Bonus Pappers : ancienneté, capital, forme juridique, CA
function pappersBonus(pappers: Awaited<ReturnType<typeof getPappersEnrichment>>): number {
  if (!pappers) return 0
  let bonus = 0

  // Ancienneté de la structure
  const dateImmat = pappers.date_immatriculation_rcs
  if (dateImmat) {
    const age = new Date().getFullYear() - new Date(dateImmat).getFullYear()
    if (age > 15)     bonus += 8
    else if (age > 10) bonus += 6
    else if (age > 5)  bonus += 4
    else if (age > 2)  bonus += 2
  }

  // Capital social
  const capital = pappers.capital ?? 0
  if (capital > 500_000)      bonus += 8
  else if (capital > 100_000)  bonus += 5
  else if (capital > 50_000)   bonus += 3
  else if (capital > 10_000)   bonus += 1

  // Forme juridique — structures libérales en société = fort signal patrimonial
  const forme = (pappers.forme_juridique ?? '').toLowerCase()
  if (/selarl|selas|selca/.test(forme))     bonus += 5
  else if (/sas\b|sca\b|sa\b/.test(forme))  bonus += 3

  // CA disponible (dernier exercice)
  const lastFinance = pappers.finances?.[0]
  if (lastFinance?.chiffre_affaires) {
    const ca = lastFinance.chiffre_affaires
    if (ca > 1_000_000)      bonus += 8
    else if (ca > 500_000)    bonus += 5
    else if (ca > 200_000)    bonus += 3
    else if (ca > 100_000)    bonus += 1
  }

  return bonus
}

function unauthorized() {
  return new NextResponse('Unauthorized', { status: 401 })
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return unauthorized()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Personnes raw insérées il y a plus de 24h, non encore enrichies standard
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: persons, error } = await supabase
    .from('prospection_persons')
    .select('canonical_key, person_type, profession_libelle, departement, code_postal, naf_code, siren, siret, rpps_number')
    .eq('enrichment_level', 'raw')
    .lt('created_at', since)
    .order('created_at', { ascending: true })
    .limit(BATCH)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!persons?.length) return NextResponse.json({ enriched: 0, done: true })

  const now = new Date().toISOString()
  let enriched = 0
  let errors = 0

  await Promise.allSettled(
    (persons as PersonRow[]).map(async (p) => {
      try {
        // 1. Données Pappers standard (seulement si SIREN disponible)
        const siren = p.siren ?? (p.siret ? p.siret.slice(0, 9) : null)
        const [pappers, bodacc] = await Promise.all([
          siren ? getPappersEnrichment(siren) : Promise.resolve(null),
          siren ? getBodaccBySiren(siren, 10) : Promise.resolve([]),
        ])

        // 2. Score règles métier enrichi des données Pappers
        const { score: base, raison } = baseScore(p)
        const geo = geoBonus(p.departement, p.code_postal)
        const papBonus = pappersBonus(pappers)
        const siretBonus = p.siret ? 3 : p.rpps_number ? 2 : 0
        const score = Math.min(base + geo + papBonus + siretBonus, 100)

        // 3. Construire extended_data standard
        const extended: Record<string, unknown> = {}
        if (pappers) {
          extended.pappers_standard = {
            capital: pappers.capital,
            forme_juridique: pappers.forme_juridique,
            date_immatriculation_rcs: pappers.date_immatriculation_rcs,
            effectif_max: pappers.effectif_max,
            nb_etablissements: pappers.nb_etablissements,
            finances: pappers.finances?.slice(0, 3) ?? [],  // 3 derniers exercices max
          }
        }
        if (bodacc.length > 0) {
          extended.bodacc_events = bodacc.slice(0, 10)
          extended.bodacc_count = bodacc.length
        }

        // 4. Mise à jour en base
        await supabase
          .from('prospection_persons')
          .update({
            patrimony_score: score,
            raison_principale: `[standard] ${raison}`,
            extended_data: extended,
            enrichment_level: 'standard',
            enriched_at: now,
            updated_at: now,
          })
          .eq('canonical_key', p.canonical_key)

        enriched++
      } catch {
        errors++
      }
    }),
  )

  return NextResponse.json({
    enriched,
    errors,
    done: persons.length < BATCH,
  })
}
