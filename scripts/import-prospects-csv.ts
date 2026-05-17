// Importe un CSV de prospects pré-enrichis (Lemlist, Apollo, etc.) dans une campagne.
// Le CSV doit avoir les colonnes : prenom, nom, linkedin_url, entreprise, titre_poste
// (l'ordre n'importe pas, seule l'orthographe des en-têtes compte).
//
// Usage :
//   npx tsx scripts/import-prospects-csv.ts <campaign-id> <csv-path>
//
// Comportement :
//   - Idempotent : peut être relancé sans créer de doublons (clé = linkedin_url)
//   - Crée le prospect s'il n'existe pas, le réutilise sinon
//   - Crée l'enrôlement en status='profile_search' avec linkedin_url_resolved
//     → le bot enverra l'invitation directement, sans chercher
//   - Skippe les lignes avec linkedin_url invalide ou nom/prénom placeholder
//
// Note : utilise PostgREST direct via fetch (pas supabase-js) pour éviter le
// conflit WebSocket sur Node 20.

import { readFileSync } from 'fs'
import { resolve } from 'path'

// Charge .env.local manuellement
function loadDotEnv() {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
    for (const line of content.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  } catch { /* env vars déjà setées */ }
}
loadDotEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définis (cf .env.local)')
  process.exit(1)
}

const [campaignId, csvPath] = process.argv.slice(2)
if (!campaignId || !csvPath) {
  console.error('Usage: npx tsx scripts/import-prospects-csv.ts <campaign-id> <csv-path>')
  process.exit(1)
}

const REST = `${SUPABASE_URL}/rest/v1`
const HEADERS = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

async function rest<T = unknown>(path: string, init?: RequestInit & { preferReturn?: boolean }): Promise<T> {
  const headers: Record<string, string> = { ...HEADERS, ...(init?.headers as Record<string, string>) }
  if (init?.preferReturn) headers['Prefer'] = 'return=representation'
  const res = await fetch(`${REST}${path}`, { ...init, headers })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PostgREST ${res.status} on ${path}: ${text}`)
  }
  // POST sans Prefer:return=representation → 201 avec body vide → ne pas tenter de parser
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text)
}

// Parser CSV minimal qui gère les champs entre guillemets et les virgules dedans.
function parseCSV(text: string): Record<string, string>[] {
  const lines: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') inQuotes = false
      else cell += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(cell); cell = '' }
      else if (c === '\n' || c === '\r') {
        if (cell || row.length) { row.push(cell); lines.push(row); row = []; cell = '' }
        if (c === '\r' && text[i + 1] === '\n') i++
      }
      else cell += c
    }
  }
  if (cell || row.length) { row.push(cell); lines.push(row) }

  if (lines.length < 2) return []
  const header = lines[0].map(h => h.trim().toLowerCase())
  return lines.slice(1).map(cols => {
    const obj: Record<string, string> = {}
    header.forEach((h, idx) => { obj[h] = (cols[idx] ?? '').trim() })
    return obj
  })
}

function isValidLinkedInUrl(url: string): boolean {
  if (!url) return false
  return /^https?:\/\/(www\.)?linkedin\.com\/in\/[^/?#]+/i.test(url)
}

// Détecte les placeholders Lemlist quand l'enrichissement a échoué
function isPlaceholder(s: string): boolean {
  if (!s) return true
  const lower = s.toLowerCase()
  return lower === 'trouver' || lower === "l'email" || lower === 'lemail' || lower === 'n/a' || lower === '-'
}

interface Campaign { id: string; name: string; org_id: string; status: string }
interface Prospect { id: string }
interface Enrollment { id: string; status: string }

async function main() {
  console.log(`📥 Lecture du CSV : ${csvPath}`)
  const raw = readFileSync(resolve(csvPath), 'utf8')
  const rows = parseCSV(raw)
  console.log(`   ${rows.length} ligne(s) lue(s)`)

  // Vérifier la campagne et récupérer org_id
  const campaigns = await rest<Campaign[]>(
    `/prospection_campaigns?id=eq.${campaignId}&select=id,name,org_id,status`
  )
  const campaign = campaigns[0]
  if (!campaign) {
    console.error(`❌ Campagne ${campaignId} introuvable`)
    process.exit(1)
  }
  console.log(`🎯 Cible : "${campaign.name}" (status: ${campaign.status}, org: ${campaign.org_id})`)

  let created = 0, reused = 0, skipped = 0, errored = 0, enrolled = 0, alreadyEnrolled = 0

  for (const row of rows) {
    const prenom = row.prenom
    const nom = row.nom
    const linkedin_url = row.linkedin_url
    const entreprise = row.entreprise || ''
    const titre_poste = row.titre_poste || ''

    if (!isValidLinkedInUrl(linkedin_url)) {
      console.warn(`  ⚠️ skip (url invalide) : "${prenom} ${nom}" → "${linkedin_url}"`)
      skipped++
      continue
    }
    if (isPlaceholder(prenom) || isPlaceholder(nom)) {
      console.warn(`  ⚠️ skip (placeholder) : "${prenom} ${nom}" → ${linkedin_url}`)
      skipped++
      continue
    }

    // 1. Upsert prospect par linkedin_url
    let prospect_id: string
    try {
      const existing = await rest<Prospect[]>(
        `/prospection_prospects?org_id=eq.${campaign.org_id}&linkedin_url=eq.${encodeURIComponent(linkedin_url)}&select=id`
      )
      if (existing[0]) {
        prospect_id = existing[0].id
        reused++
      } else {
        const inserted = await rest<Prospect[]>('/prospection_prospects', {
          method: 'POST',
          preferReturn: true,
          body: JSON.stringify({
            org_id: campaign.org_id,
            linkedin_url,
            linkedin_data: { prenom, nom, entreprise, titre_poste },
            enrichment_data: {
              dirigeant_prenom: prenom,
              dirigeant_nom: nom,
              entreprise_nom: entreprise,
              poste: titre_poste,
              source: 'csv_import',
            },
            crm_stage: 'to_contact',
          }),
        })
        prospect_id = inserted[0].id
        created++
      }
    } catch (e) {
      console.error(`  ❌ prospect échoué pour "${prenom} ${nom}" : ${(e as Error).message}`)
      errored++
      continue
    }

    // 2. Upsert enrôlement par (campaign_id, prospect_id)
    try {
      const existingEnr = await rest<Enrollment[]>(
        `/prospection_campaign_enrollments?campaign_id=eq.${campaign.id}&prospect_id=eq.${prospect_id}&select=id,status`
      )
      if (existingEnr[0]) {
        alreadyEnrolled++
        console.log(`  ↪ "${prenom} ${nom}" déjà enrôlé (status: ${existingEnr[0].status})`)
        continue
      }
      await rest('/prospection_campaign_enrollments', {
        method: 'POST',
        body: JSON.stringify({
          campaign_id: campaign.id,
          prospect_id,
          org_id: campaign.org_id,
          status: 'profile_search',
          current_step: 1,
          linkedin_url_resolved: linkedin_url,
        }),
      })
      enrolled++
      console.log(`  ✅ "${prenom} ${nom}" → ${linkedin_url}`)
    } catch (e) {
      console.error(`  ❌ enroll échoué pour "${prenom} ${nom}" : ${(e as Error).message}`)
      errored++
    }
  }

  console.log(`\n📊 Résumé :`)
  console.log(`   Prospects créés     : ${created}`)
  console.log(`   Prospects réutilisés: ${reused}`)
  console.log(`   Enrôlements créés   : ${enrolled}`)
  console.log(`   Déjà enrôlés        : ${alreadyEnrolled}`)
  console.log(`   Lignes ignorées     : ${skipped}`)
  console.log(`   Erreurs             : ${errored}`)
}

main().catch(e => { console.error('💥', e); process.exit(1) })
