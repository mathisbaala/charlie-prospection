import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60

type SectorUpdate = {
  rpps_number: string
  secteur: string
}

type PersonRow = {
  canonical_key: string
  rpps_number: string | null
  patrimony_score: number | null
  raison_principale: string | null
  extended_data: Record<string, unknown> | null
}

function parseSectorInfo(secteur: string): { bonus: number; label: string } | null {
  const s = secteur.toLowerCase().trim()
  if (!s) return null
  if (s.includes('secteur 2')) return { bonus: 12, label: 'Secteur 2 (honoraires libres)' }
  if (s.includes('optam-co') || s.includes('optam co')) return { bonus: 10, label: 'Optam-CO' }
  if (s.includes('optam')) return { bonus: 6, label: 'Optam' }
  if (s.includes('secteur 3') || s.includes('non convention')) return { bonus: 8, label: 'Secteur 3' }
  return null // secteur 1 ou inconnu → pas de bonus
}

/**
 * POST /api/admin/rpps-sector-update
 *
 * Applique un bonus patrimonial aux médecins dont le secteur conventionnel
 * (2, 3, Optam) est fourni. Ne touche que les personnes déjà quick-scorées
 * (patrimony_score IS NOT NULL) et non encore enrichies en secteur
 * (extended_data.secteur_rpps absent).
 *
 * Body: { updates: [{ rpps_number, secteur }] }
 * Typiquement 500 entrées par appel.
 */
export async function POST(request: Request) {
  const key = request.headers.get('x-admin-key')
  if (key !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as { updates: SectorUpdate[] }
  const updates = body.updates ?? []
  if (!updates.length) return NextResponse.json({ ok: true, updated: 0 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const rppsNumbers = [...new Set(updates.map((u) => u.rpps_number).filter(Boolean))]

  const { data: persons, error } = await supabase
    .from('prospection_persons')
    .select('canonical_key, rpps_number, patrimony_score, raison_principale, extended_data')
    .in('rpps_number', rppsNumbers)
    .not('patrimony_score', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!persons || persons.length === 0) return NextResponse.json({ ok: true, updated: 0 })

  const updateMap = new Map(updates.map((u) => [u.rpps_number, u.secteur]))
  const now = new Date().toISOString()

  let updated = 0

  await Promise.allSettled(
    (persons as PersonRow[])
      .filter((p) => {
        // Skip si secteur déjà renseigné (idempotence)
        if (p.extended_data && p.extended_data.secteur_rpps) return false
        return true
      })
      .map(async (p) => {
        const secteur = updateMap.get(p.rpps_number ?? '')
        if (!secteur) return
        const parsed = parseSectorInfo(secteur)
        if (!parsed) return // secteur 1 → pas de mise à jour

        const newScore = Math.min(100, (p.patrimony_score ?? 50) + parsed.bonus)
        const existingRaison = p.raison_principale ?? ''
        const newRaison = existingRaison.includes('•')
          ? existingRaison
          : `${existingRaison} • ${parsed.label}`

        const { error } = await supabase
          .from('prospection_persons')
          .update({
            patrimony_score: newScore,
            raison_principale: newRaison,
            extended_data: {
              ...(p.extended_data ?? {}),
              secteur_rpps: secteur,
            },
            updated_at: now,
          })
          .eq('canonical_key', p.canonical_key)

        if (!error) updated++
      }),
  )

  return NextResponse.json({ ok: true, updated })
}
