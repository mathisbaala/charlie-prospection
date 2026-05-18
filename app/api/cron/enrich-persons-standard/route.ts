// Cron quotidien 08:00 UTC — Enrichissement standard des personnes 'raw' depuis 24h.
//
// Étape 2 du pipeline :
//   Étape 1 : ingest (RPPS/AE/Sirene) → enrichment_level='raw', aucune donnée externe
//   Étape 2 : ce cron → Annuaire Entreprises + BODACC + score étendu → enrichment_level='standard'
//   Étape 3 : /api/suivi/add → deep enrichment + Claude → enrichment_level='deep'
//
// ZÉRO token Pappers. Sources : Annuaire Entreprises (data.gouv.fr, gratuit, illimité)
// + BODACC (opendata Etalab, gratuit) + données RPPS déjà en base.
//
// Score enrichi : profession + géo + AE (forme juridique, effectifs, ancienneté, catégorie)
// + secteur conventionnel médecins (si déjà renseigné par rpps-sector-update).

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getEntrepriseBySiren, type AEResult } from '@/lib/data-sources/annuaire-entreprises'
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
  extended_data: Record<string, unknown> | null
}

// ── Score de base par profession ──────────────────────────────────────────────

function baseScore(p: PersonRow): { score: number; raison: string } {
  const prof = (p.profession_libelle ?? '').toLowerCase()
  let score = 30
  let raison = 'Libéral'

  switch (p.person_type) {
    // ── Santé — professions médicales ────────────────────────────────────────
    case 'médecin':
      if (/chirurg|anesthés|cardio|radiol|ophtalmol|orthop/.test(prof)) {
        score = 82; raison = 'Médecin spécialiste — plateau technique élevé'
      } else if (/spécial|dermato|psychiatr|pédiat|gynécol|neurolog/.test(prof)) {
        score = 72; raison = 'Médecin spécialiste'
      } else {
        score = 56; raison = 'Médecin généraliste'
      }
      break
    case 'biologiste_médical':   score = 80; raison = 'Biologiste médical — labo privé (SEL)'; break
    case 'dentiste':             score = 68; raison = 'Chirurgien-dentiste libéral'; break
    case 'pharmacien':           score = 65; raison = 'Pharmacien titulaire d\'officine'; break
    case 'kiné':                 score = 48; raison = 'Masseur-kinésithérapeute libéral'; break
    case 'audioprothésiste':     score = 68; raison = 'Audioprothésiste — revenus élevés'; break
    case 'opticien':             score = 55; raison = 'Opticien-lunetier — fonds de commerce'; break
    case 'sage_femme':           score = 44; raison = 'Sage-femme libérale'; break
    case 'infirmier':            score = 42; raison = 'Infirmier libéral'; break
    case 'orthophoniste':        score = 44; raison = 'Orthophoniste libéral'; break
    case 'podologue':            score = 42; raison = 'Podologue-pédicure libéral'; break
    case 'ergothérapeute':       score = 40; raison = 'Ergothérapeute libéral'; break
    case 'orthoptiste':          score = 42; raison = 'Orthoptiste libéral'; break
    // ── Droit ────────────────────────────────────────────────────────────────
    case 'notaire':              score = 78; raison = 'Notaire — office libéral'; break
    case 'huissier':             score = 70; raison = 'Commissaire de justice'; break
    case 'greffier':             score = 72; raison = 'Greffier de tribunal de commerce'; break
    case 'commissaire_priseur':  score = 76; raison = 'Commissaire-priseur — ventes aux enchères'; break
    case 'expert_judiciaire':    score = 60; raison = 'Expert judiciaire'; break
    case 'commissaire_aux_comptes': score = 68; raison = 'Commissaire aux comptes'; break
    case 'expert_comptable':     score = 63; raison = 'Expert-comptable'; break
    case 'conseil_pi':           score = 65; raison = 'Conseil en propriété industrielle'; break
    case 'avocat':               score = 60; raison = 'Avocat'; break
    // ── Finance & assurance ──────────────────────────────────────────────────
    case 'conseiller_financier': score = 72; raison = 'Conseiller en gestion de patrimoine'; break
    case 'courtier_assurance':   score = 55; raison = 'Courtier / agent en assurance'; break
    // ── Libéraux divers ──────────────────────────────────────────────────────
    case 'vétérinaire':          score = 64; raison = 'Vétérinaire libéral'; break
    case 'architecte':           score = 58; raison = 'Architecte libéral'; break
    case 'géomètre':             score = 58; raison = 'Géomètre-expert'; break
    case 'ostéopathe':           score = 46; raison = 'Ostéopathe'; break
    case 'psychologue':          score = 44; raison = 'Psychologue libéral'; break
    case 'agent_immobilier':     score = 48; raison = 'Agent immobilier'; break
    // ── Fallback ─────────────────────────────────────────────────────────────
    case 'autre_libéral':        score = 44; raison = 'Libéral'; break
    default:                     score = 34; raison = 'Dirigeant'
  }

  return { score, raison }
}

// ── Bonus géographie ──────────────────────────────────────────────────────────

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

// ── Bonus Annuaire Entreprises (gratuit, remplace Pappers standard) ───────────
//
// nature_juridique : code numérique INSEE
//   5710 = SELARL, 5785 = SELAS, 5720 = SELCA  → structures libérales en société
//   5498 = SAS, 5499 = SASU
//   5308 = SARL, 5599/6540 = SA
//
// tranche_effectif_salarie : code INSEE
//   00-03 = 0-9, 11 = 10-19, 12 = 20-49
//   21 = 50-99, 22 = 100-199, 31 = 200-249, 32+ = 250+

function aeBonus(ae: AEResult | null): number {
  if (!ae) return 0
  let bonus = 0

  // Forme juridique
  const nj = ae.nature_juridique ?? ''
  if (['5710', '5785', '5720'].includes(nj)) bonus += 5      // SELARL / SELAS / SELCA
  else if (['5498', '5499'].includes(nj)) bonus += 3          // SAS / SASU
  else if (['5308', '5599', '6540'].includes(nj)) bonus += 2  // SARL / SA

  // Effectifs
  const tranche = ae.tranche_effectif_salarie ?? ''
  if (['31', '32', '41', '42', '51', '52', '53'].includes(tranche)) bonus += 8  // 200+
  else if (['21', '22'].includes(tranche)) bonus += 5                            // 50-199
  else if (['11', '12'].includes(tranche)) bonus += 3                            // 10-49

  // Catégorie entreprise (synthèse INSEE)
  switch (ae.categorie_entreprise) {
    case 'GE':  bonus += 10; break  // Grande Entreprise
    case 'ETI': bonus += 7;  break  // Entreprise de Taille Intermédiaire
    case 'PME': bonus += 2;  break  // signal de structure formalisée
  }

  // Ancienneté
  const dateCreation = ae.date_creation
  if (dateCreation) {
    const age = new Date().getFullYear() - new Date(dateCreation).getFullYear()
    if (age > 15)      bonus += 8
    else if (age > 10) bonus += 6
    else if (age > 5)  bonus += 4
    else if (age > 2)  bonus += 2
  }

  return bonus
}

// ── Bonus secteur conventionnel médecins ──────────────────────────────────────
// Lit le secteur_rpps déjà stocké dans extended_data (via rpps-sector-update).
// Ne fait aucun appel API — lecture locale uniquement.

function secteurBonus(extendedData: Record<string, unknown> | null): number {
  const secteur = ((extendedData?.secteur_rpps ?? '') as string).toLowerCase()
  if (!secteur) return 0
  if (secteur.includes('secteur 2')) return 12
  if (secteur.includes('optam-co') || secteur.includes('optam co')) return 10
  if (secteur.includes('optam')) return 6
  if (secteur.includes('secteur 3') || secteur.includes('non convention')) return 8
  return 0
}

// ── Route handler ─────────────────────────────────────────────────────────────

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

  // Personnes raw insérées il y a plus de 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: persons, error } = await supabase
    .from('prospection_persons')
    .select('canonical_key, person_type, profession_libelle, departement, code_postal, naf_code, siren, siret, rpps_number, extended_data')
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
        const siren = p.siren ?? (p.siret ? p.siret.slice(0, 9) : null)

        // Sources gratuites uniquement — pas de Pappers
        const [ae, bodacc] = await Promise.all([
          siren ? getEntrepriseBySiren(siren) : Promise.resolve(null),
          siren ? getBodaccBySiren(siren, 10) : Promise.resolve([]),
        ])

        // Score étendu
        const { score: base, raison } = baseScore(p)
        const geo    = geoBonus(p.departement, p.code_postal)
        const aeB    = aeBonus(ae)
        const secteur = secteurBonus(p.extended_data)
        const struct = p.siret ? 3 : p.rpps_number ? 2 : 0
        const score  = Math.min(base + geo + aeB + secteur + struct, 100)

        // Fusionner avec l'extended_data existant pour ne pas écraser
        // les champs déjà présents (ex: secteur_rpps mis par rpps-sector-update)
        const existing = p.extended_data ?? {}
        const extended: Record<string, unknown> = { ...existing }

        if (ae) {
          extended.ae_standard = {
            nature_juridique: ae.nature_juridique,
            tranche_effectif_salarie: ae.tranche_effectif_salarie,
            categorie_entreprise: ae.categorie_entreprise,
            date_creation: ae.date_creation,
            nom_complet: ae.nom_complet,
          }
        }
        if (bodacc.length > 0) {
          extended.bodacc_events = bodacc.slice(0, 10)
          extended.bodacc_count = bodacc.length
        }

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
      } catch (err) {
        console.error('[enrich-standard] error on', p.canonical_key, err instanceof Error ? err.message : String(err))
        errors++
      }
    }),
  )

  return NextResponse.json({ enriched, errors, done: persons.length < BATCH })
}
