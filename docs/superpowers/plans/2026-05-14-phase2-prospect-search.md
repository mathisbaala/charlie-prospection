# Charlie Prospection — Phase 2 : Recherche & Enrichissement Prospects

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Après saisie d'un ICP en langage naturel, afficher directement dans l'app une liste de prospects réels enrichis — données entreprise (SIRENE), signaux patrimoniaux (BODACC), transactions immobilières (DVF), score patrimonial calculé par Claude, et lien LinkedIn.

**Architecture:** Recherche multi-sources via APIs gratuites françaises (Annuaire Entreprises data.gouv.fr, BODACC, DVF) + enrichissement asynchrone + scoring Claude. Pas d'extension Chrome pour l'instant — LinkedIn = enrichissement indirect (URL de recherche construite). Tout est stocké dans `prospection_prospects` et `prospection_signals`.

**Tech Stack:** Next.js 15 App Router, Supabase, Claude Sonnet 4.6, APIs gratuites (Annuaire Entreprises, BODACC opendatasoft, DVF etalab)

---

## File Structure

```
lib/
  data-sources/
    annuaire-entreprises.ts   — Annuaire Entreprises data.gouv.fr (SIRENE aggregé)
    bodacc.ts                 — BODACC opendatasoft (annonces légales)
    dvf.ts                    — DVF etalab (transactions immobilières)
  prospect-search/
    naf-mapper.ts             — ICP roles → codes NAF + keywords
    engine.ts                 — Orchestrateur multi-sources
  enrichment/
    enricher.ts               — Pipeline d'enrichissement pour un prospect
    patrimony-scorer.ts       — Score patrimonial 0-100 via Claude
app/
  api/
    prospects/
      search/route.ts         — POST: ICP → lancement recherche + enrichissement
      route.ts                — GET: liste prospects paginée avec filtres
      [id]/route.ts           — GET: fiche complète + PATCH: mise à jour stage
  (app)/
    prospects/page.tsx        — Page prospects (remplace le stub)
components/
  prospects/
    search-launcher.tsx       — Bouton "Lancer la recherche" depuis l'ICP
    prospect-table.tsx        — Table avec scores, signaux, actions
    patrimony-score-badge.tsx — Badge score 0-100 coloré
    signal-badge.tsx          — Badge signal patrimonial typé
    prospect-detail-sheet.tsx — Panel latéral fiche enrichie complète
```

---

## Task 1 : Types + Connecteurs de données

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/data-sources/annuaire-entreprises.ts`
- Create: `lib/data-sources/bodacc.ts`
- Create: `lib/data-sources/dvf.ts`

- [ ] **Step 1: Ajouter les types d'enrichissement dans `lib/types.ts`**

Ajouter à la fin du fichier existant :

```typescript
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

  // Signaux BODACC
  bodacc_events?: BodaccEvent[]

  // Transactions immobilières (DVF)
  dvf_transactions?: DvfTransaction[]
  patrimoine_immo_estime?: number

  // LinkedIn indirect
  linkedin_search_url?: string
  linkedin_titre?: string

  // Scores calculés
  valeur_entreprise_estimee?: number
  revenus_implicites_estimes?: number
  patrimoine_total_estime?: number

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
```

- [ ] **Step 2: Créer `lib/data-sources/annuaire-entreprises.ts`**

```typescript
const BASE = 'https://recherche-entreprises.api.gouv.fr'

export interface AEDirigeant {
  nom: string
  prenoms?: string
  qualite: string
  date_naissance_timestamp_utc?: string
  annee_de_naissance?: string
}

export interface AEResult {
  siren: string
  nom_complet: string
  activite_principale: string
  libelle_activite_principale?: string
  date_creation?: string
  tranche_effectif_salarie?: string
  siege: {
    adresse?: string
    code_postal?: string
    commune?: string
    departement?: string
    latitude?: number
    longitude?: number
  }
  dirigeants?: AEDirigeant[]
}

export async function searchEntreprises(params: {
  q?: string
  activite_principale?: string
  departement?: string
  page?: number
  per_page?: number
}): Promise<{ results: AEResult[]; total_results: number }> {
  const url = new URL(`${BASE}/search`)
  if (params.q) url.searchParams.set('q', params.q)
  if (params.activite_principale) url.searchParams.set('activite_principale', params.activite_principale)
  if (params.departement) url.searchParams.set('departement', params.departement)
  url.searchParams.set('page', String(params.page ?? 1))
  url.searchParams.set('per_page', String(params.per_page ?? 25))

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } })
  if (!res.ok) throw new Error(`AE API ${res.status}: ${url}`)
  const data = await res.json()
  return {
    results: data.results ?? [],
    total_results: data.total_results ?? 0,
  }
}

export async function getEntrepriseBySiren(siren: string): Promise<AEResult | null> {
  const res = await fetch(`${BASE}/search?q=${siren}&per_page=1`, { next: { revalidate: 3600 } })
  if (!res.ok) return null
  const data = await res.json()
  return data.results?.[0] ?? null
}
```

- [ ] **Step 3: Créer `lib/data-sources/bodacc.ts`**

```typescript
const BASE = 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records'

export interface BodaccRecord {
  id: string
  dateparution: string
  typeavis_lib?: string
  familleavis_lib?: string
  commercant?: string
  ville?: string
  cp?: string
  registre?: string
}

export async function getBodaccBySiren(siren: string, limit = 10): Promise<BodaccRecord[]> {
  const where = `registre_rc_cs like "${siren}"`
  const url = `${BASE}?where=${encodeURIComponent(where)}&limit=${limit}&order_by=dateparution%20desc`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const data = await res.json()
    return data.results ?? []
  } catch {
    return []
  }
}

export async function getBodaccByName(nom: string, limit = 5): Promise<BodaccRecord[]> {
  const where = `commercant like "${nom.toUpperCase()}"`
  const url = `${BASE}?where=${encodeURIComponent(where)}&limit=${limit}&order_by=dateparution%20desc`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const data = await res.json()
    return data.results ?? []
  } catch {
    return []
  }
}

export function classifyBodaccEvent(record: BodaccRecord): 'cession' | 'creation' | 'radiation' | 'modification' | 'procedure_collective' | 'autre' {
  const lib = (record.familleavis_lib ?? record.typeavis_lib ?? '').toLowerCase()
  if (lib.includes('cession') || lib.includes('vente')) return 'cession'
  if (lib.includes('création') || lib.includes('immatriculation')) return 'creation'
  if (lib.includes('radiation') || lib.includes('dissolution')) return 'radiation'
  if (lib.includes('redressement') || lib.includes('liquidation') || lib.includes('sauvegarde')) return 'procedure_collective'
  if (lib.includes('modification')) return 'modification'
  return 'autre'
}
```

- [ ] **Step 4: Créer `lib/data-sources/dvf.ts`**

```typescript
const BASE = 'https://api.dvf.etalab.gouv.fr/dvf/1.0'

export interface DvfRecord {
  id_mutation: string
  date_mutation: string
  nature_mutation: string
  valeur_fonciere: number
  adresse_numero?: string
  adresse_voie?: string
  code_commune: string
  nom_commune: string
  code_departement: string
  type_local?: string
  surface_reelle_bati?: number
  nombre_pieces_principales?: number
}

export async function getDvfByCommune(codeCommune: string, minValeur = 0, limit = 20): Promise<DvfRecord[]> {
  try {
    const url = `${BASE}/communes/${codeCommune}/dvf/?page=1&page_size=${limit}`
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) return []
    const data = await res.json()
    const results: DvfRecord[] = data.results ?? []
    return results.filter(r => r.valeur_fonciere >= minValeur)
  } catch {
    return []
  }
}

// Estime la valeur du patrimoine immobilier d'une entreprise
// en cherchant des transactions DVF à son adresse (commune)
export async function getDvfEnrichmentForProspect(codeCommune: string): Promise<{
  transactions: DvfRecord[]
  valeur_totale_estimee: number
  nb_transactions: number
}> {
  const transactions = await getDvfByCommune(codeCommune, 300_000, 10)
  const valeur_totale_estimee = transactions.reduce((sum, t) => sum + (t.valeur_fonciere ?? 0), 0)
  return { transactions, valeur_totale_estimee, nb_transactions: transactions.length }
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/data-sources/
git commit -m "feat: add data source connectors (Annuaire Entreprises, BODACC, DVF)"
```

---

## Task 2 : NAF Mapper + Moteur de recherche

**Files:**
- Create: `lib/prospect-search/naf-mapper.ts`
- Create: `lib/prospect-search/engine.ts`

- [ ] **Step 1: Créer `lib/prospect-search/naf-mapper.ts`**

```typescript
// Mapping ICP roles → codes NAF et mots-clés de recherche

export const NAF_MAP: Record<string, { codes: string[]; keywords: string[] }> = {
  'médecin généraliste': { codes: ['86.21Z'], keywords: ['médecin général'] },
  'médecin spécialiste': { codes: ['86.22A', '86.22B', '86.22C', '86.22D'], keywords: ['médecin spécialiste'] },
  'chirurgien': { codes: ['86.22A'], keywords: ['chirurgien'] },
  'dentiste': { codes: ['86.23Z'], keywords: ['dentiste', 'chirurgien-dentiste'] },
  'pharmacien': { codes: ['47.73Z'], keywords: ['pharmacie', 'pharmacien'] },
  'kinésithérapeute': { codes: ['86.90A'], keywords: ['kiné', 'kinésithérapeute'] },
  'infirmier': { codes: ['86.90C'], keywords: ['infirmier', 'cabinet infirmier'] },
  'vétérinaire': { codes: ['75.00Z'], keywords: ['vétérinaire'] },
  'avocat': { codes: ['69.10Z'], keywords: ['avocat', 'cabinet avocats'] },
  'expert comptable': { codes: ['69.20Z'], keywords: ['expert comptable', 'cabinet comptable'] },
  'notaire': { codes: ['69.10Z'], keywords: ['notaire', 'office notarial'] },
  'architecte': { codes: ['71.11Z'], keywords: ['architecte', 'cabinet architecture'] },
  'dirigeant': { codes: ['70.10Z', '70.22Z', '64.20Z'], keywords: ['holding', 'direction générale'] },
  'entrepreneur': { codes: [], keywords: ['entrepreneur', 'fondateur', 'dirigeant'] },
  'chef d\'entreprise': { codes: [], keywords: ['directeur général', 'PDG', 'président'] },
  'directeur': { codes: [], keywords: ['directeur', 'direction'] },
  'libéral': { codes: ['86.21Z', '86.22A', '86.23Z', '69.10Z', '69.20Z'], keywords: ['libéral', 'cabinet'] },
  'professionnel de santé': { codes: ['86.21Z', '86.22A', '86.22B', '86.22C', '86.23Z', '86.90A', '86.90C'], keywords: ['santé', 'médical'] },
}

export function mapRolesToNaf(roles: string[]): { codes: string[]; keywords: string[] } {
  const codes = new Set<string>()
  const keywords = new Set<string>()

  for (const role of roles) {
    const lower = role.toLowerCase()
    for (const [key, val] of Object.entries(NAF_MAP)) {
      if (lower.includes(key) || key.split(' ').every(w => lower.includes(w))) {
        val.codes.forEach(c => codes.add(c))
        val.keywords.forEach(k => keywords.add(k))
      }
    }
  }

  // Fallback : utiliser le rôle brut comme keyword
  if (codes.size === 0 && keywords.size === 0) {
    roles.forEach(r => keywords.add(r))
  }

  return { codes: Array.from(codes), keywords: Array.from(keywords) }
}

// Mapping localisations ICP → codes département INSEE
export function mapLocationsToDepartements(locations: string[]): string[] {
  const DEPT_MAP: Record<string, string[]> = {
    'île-de-france': ['75', '77', '78', '91', '92', '93', '94', '95'],
    'idf': ['75', '77', '78', '91', '92', '93', '94', '95'],
    'paris': ['75'],
    'hauts-de-seine': ['92'],
    'val-de-marne': ['94'],
    'seine-saint-denis': ['93'],
    'lyon': ['69'],
    'marseille': ['13'],
    'bordeaux': ['33'],
    'toulouse': ['31'],
    'nantes': ['44'],
    'lille': ['59'],
    'strasbourg': ['67'],
    'nice': ['06'],
    'montpellier': ['34'],
    'rennes': ['35'],
    'auvergne-rhône-alpes': ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'],
    'paca': ['04', '05', '06', '13', '83', '84'],
    'occitanie': ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'],
    'bretagne': ['22', '29', '35', '56'],
    'normandie': ['14', '27', '50', '61', '76'],
    'grand est': ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'],
    'hauts-de-france': ['02', '59', '60', '62', '80'],
    'nouvelle-aquitaine': ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'],
    'pays de la loire': ['44', '49', '53', '72', '85'],
    'centre-val de loire': ['18', '28', '36', '37', '41', '45'],
    'bourgogne-franche-comté': ['21', '25', '39', '58', '70', '71', '89', '90'],
    'france': [], // national = no filter
  }

  const depts = new Set<string>()
  for (const loc of locations) {
    const lower = loc.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    for (const [key, codes] of Object.entries(DEPT_MAP)) {
      const normKey = key.normalize('NFD').replace(/[̀-ͯ]/g, '')
      if (lower.includes(normKey) || normKey.includes(lower)) {
        codes.forEach(c => depts.add(c))
      }
    }
    // Code département direct (ex: "75", "92")
    if (/^\d{2,3}$/.test(loc)) depts.add(loc)
  }

  return Array.from(depts)
}
```

- [ ] **Step 2: Créer `lib/prospect-search/engine.ts`**

```typescript
import { searchEntreprises, type AEResult } from '@/lib/data-sources/annuaire-entreprises'
import { mapRolesToNaf, mapLocationsToDepartements } from './naf-mapper'
import type { ParsedIcpCriteria, ProspectEnrichmentData } from '@/lib/types'

export interface RawProspect {
  // Identifiant unique construit
  uid: string
  // Données entreprise
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
  // Données dirigeant
  dirigeant_nom: string
  dirigeant_prenom: string
  dirigeant_qualite: string
  dirigeant_annee_naissance?: number
  // URL LinkedIn construite
  linkedin_search_url: string
  // Score initial (avant enrichissement profond)
  score_initial: number
}

function buildLinkedInSearchUrl(prenom: string, nom: string, entreprise: string): string {
  const q = encodeURIComponent(`${prenom} ${nom} ${entreprise}`)
  return `https://www.linkedin.com/search/results/people/?keywords=${q}`
}

function estimateInitialScore(ae: AEResult, dirigeant: AEResult['dirigeants'][0]): number {
  let score = 20 // base

  // Ancienneté de l'entreprise
  if (ae.date_creation) {
    const years = new Date().getFullYear() - new Date(ae.date_creation).getFullYear()
    if (years >= 10) score += 20
    else if (years >= 5) score += 10
    else score += 5
  }

  // Taille structure
  const eff = ae.tranche_effectif_salarie ?? ''
  if (['20', '21', '22', '31', '32', '41', '42', '51', '52', '53'].includes(eff)) score += 20
  else if (['11', '12'].includes(eff)) score += 10

  // Professions libérales = patrimoine plus prévisible
  const naf = ae.activite_principale ?? ''
  if (naf.startsWith('86') || naf.startsWith('69')) score += 15

  // Âge estimé du dirigeant (45-60 ans = cible idéale CGP)
  if (dirigeant?.annee_de_naissance) {
    const age = new Date().getFullYear() - parseInt(dirigeant.annee_de_naissance)
    if (age >= 45 && age <= 65) score += 15
    else if (age >= 35 && age < 45) score += 10
  }

  return Math.min(score, 70) // max 70 avant enrichissement profond
}

export async function searchProspects(
  criteria: ParsedIcpCriteria,
  options: { limit?: number } = {}
): Promise<RawProspect[]> {
  const limit = options.limit ?? 30
  const { codes: nafCodes, keywords } = mapRolesToNaf(criteria.roles)
  const departements = mapLocationsToDepartements(criteria.locations)

  const results: RawProspect[] = []
  const seen = new Set<string>() // dédoublonnage par SIREN

  // Stratégie : si codes NAF connus → requête par NAF par département
  // Sinon → requête par keyword par département
  const nafList = nafCodes.length > 0 ? nafCodes : [undefined]
  const deptList = departements.length > 0 ? departements : [undefined]

  for (const naf of nafList.slice(0, 3)) {
    for (const dept of deptList.slice(0, 5)) {
      if (results.length >= limit) break

      const q = nafCodes.length === 0 ? keywords.join(' ') : undefined

      try {
        const { results: aeResults } = await searchEntreprises({
          q,
          activite_principale: naf,
          departement: dept,
          per_page: 25,
        })

        for (const ae of aeResults) {
          if (results.length >= limit) break
          if (seen.has(ae.siren)) continue
          if (!ae.dirigeants?.length) continue

          seen.add(ae.siren)
          const dirigeant = ae.dirigeants[0]
          const prenom = dirigeant.prenoms?.split(' ')[0] ?? ''
          const nom = dirigeant.nom ?? ''

          results.push({
            uid: ae.siren,
            entreprise_nom: ae.nom_complet,
            siren: ae.siren,
            code_naf: ae.activite_principale,
            libelle_naf: ae.libelle_activite_principale ?? '',
            date_creation: ae.date_creation ?? '',
            tranche_effectifs: ae.tranche_effectif_salarie ?? '',
            adresse: ae.siege?.adresse ?? '',
            code_postal: ae.siege?.code_postal ?? '',
            ville: ae.siege?.commune ?? '',
            departement: ae.siege?.departement ?? dept ?? '',
            dirigeant_nom: nom,
            dirigeant_prenom: prenom,
            dirigeant_qualite: dirigeant.qualite ?? 'dirigeant',
            dirigeant_annee_naissance: dirigeant.annee_de_naissance
              ? parseInt(dirigeant.annee_de_naissance)
              : undefined,
            linkedin_search_url: buildLinkedInSearchUrl(prenom, nom, ae.nom_complet),
            score_initial: estimateInitialScore(ae, dirigeant),
          })
        }
      } catch {
        continue
      }
    }
    if (results.length >= limit) break
  }

  return results
}
```

- [ ] **Step 3: Tests unitaires pour le NAF mapper**

Créer `lib/prospect-search/__tests__/naf-mapper.test.ts` :

```typescript
import { describe, it, expect } from 'vitest'
import { mapRolesToNaf, mapLocationsToDepartements } from '../naf-mapper'

describe('mapRolesToNaf', () => {
  it('maps médecin généraliste to 86.21Z', () => {
    const { codes } = mapRolesToNaf(['médecin généraliste'])
    expect(codes).toContain('86.21Z')
  })

  it('maps avocat to 69.10Z', () => {
    const { codes } = mapRolesToNaf(['avocat'])
    expect(codes).toContain('69.10Z')
  })

  it('falls back to keywords for unknown role', () => {
    const { keywords } = mapRolesToNaf(['trader forex'])
    expect(keywords).toContain('trader forex')
  })
})

describe('mapLocationsToDepartements', () => {
  it('maps île-de-france to correct departments', () => {
    const depts = mapLocationsToDepartements(['Île-de-France'])
    expect(depts).toContain('75')
    expect(depts).toContain('92')
  })

  it('maps Paris to 75', () => {
    const depts = mapLocationsToDepartements(['Paris'])
    expect(depts).toContain('75')
  })

  it('handles direct department code', () => {
    const depts = mapLocationsToDepartements(['69'])
    expect(depts).toContain('69')
  })
})
```

- [ ] **Step 4: Vérifier les tests**

```bash
npx vitest run lib/prospect-search/__tests__/naf-mapper.test.ts
```

Expected : 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/prospect-search/
git commit -m "feat: add NAF mapper and prospect search engine"
```

---

## Task 3 : Pipeline d'enrichissement + Score patrimonial

**Files:**
- Create: `lib/enrichment/enricher.ts`
- Create: `lib/enrichment/patrimony-scorer.ts`

- [ ] **Step 1: Créer `lib/enrichment/enricher.ts`**

```typescript
import { getBodaccBySiren, classifyBodaccEvent } from '@/lib/data-sources/bodacc'
import { getDvfByCommune } from '@/lib/data-sources/dvf'
import type { BodaccEvent, DvfTransaction, ProspectEnrichmentData } from '@/lib/types'
import type { RawProspect } from '@/lib/prospect-search/engine'

// Mapping code postal → code commune INSEE (simplification : utilise les 5 premiers caractères)
function codePostalToCodeCommune(codePostal: string, ville: string): string {
  // Pour les grandes villes, construire le code commune
  if (codePostal === '75001' || codePostal?.startsWith('75')) return codePostal.slice(0, 5).padEnd(5, '0') || '75056'
  if (codePostal?.startsWith('69') && ville?.toLowerCase().includes('lyon')) return '69123'
  if (codePostal?.startsWith('13') && ville?.toLowerCase().includes('marseille')) return '13055'
  // Pour les autres : code postal ≈ code commune (approximation)
  return codePostal?.slice(0, 5) ?? ''
}

export async function enrichProspect(raw: RawProspect): Promise<ProspectEnrichmentData> {
  const enrichment: ProspectEnrichmentData = {
    dirigeant_nom: raw.dirigeant_nom,
    dirigeant_prenom: raw.dirigeant_prenom,
    dirigeant_qualite: raw.dirigeant_qualite,
    dirigeant_annee_naissance: raw.dirigeant_annee_naissance,
    siren: raw.siren,
    forme_juridique: raw.dirigeant_qualite,
    date_creation_entreprise: raw.date_creation,
    code_naf: raw.code_naf,
    libelle_naf: raw.libelle_naf,
    tranche_effectifs: raw.tranche_effectifs,
    adresse_entreprise: raw.adresse,
    code_postal: raw.code_postal,
    ville: raw.ville,
    departement: raw.departement,
    linkedin_search_url: raw.linkedin_search_url,
    sources_utilisees: ['annuaire_entreprises'],
    enrichi_le: new Date().toISOString(),
  }

  // Enrichissement BODACC
  if (raw.siren) {
    try {
      const bodaccRecords = await getBodaccBySiren(raw.siren, 10)
      if (bodaccRecords.length > 0) {
        enrichment.bodacc_events = bodaccRecords.map((r): BodaccEvent => ({
          id: r.id,
          date: r.dateparution,
          type: classifyBodaccEvent(r),
          libelle: r.typeavis_lib ?? r.familleavis_lib ?? 'Annonce légale',
          source: 'bodacc',
        }))
        enrichment.sources_utilisees?.push('bodacc')
      }
    } catch {
      // BODACC unavailable, skip
    }
  }

  // Enrichissement DVF (transactions récentes dans la commune)
  if (raw.code_postal) {
    try {
      const codeCommune = codePostalToCodeCommune(raw.code_postal, raw.ville)
      if (codeCommune) {
        const dvfRecords = await getDvfByCommune(codeCommune, 300_000, 10)
        if (dvfRecords.length > 0) {
          enrichment.dvf_transactions = dvfRecords.map((r): DvfTransaction => ({
            id: r.id_mutation,
            date_mutation: r.date_mutation,
            nature_mutation: r.nature_mutation,
            valeur_fonciere: r.valeur_fonciere,
            type_local: r.type_local ?? 'bien',
            surface_reelle_bati: r.surface_reelle_bati,
            adresse: `${r.adresse_numero ?? ''} ${r.adresse_voie ?? ''}`.trim(),
            commune: r.nom_commune,
          }))
          // Estimation grossière : patrimoine immo = médiane des transactions dans la zone
          const values = dvfRecords.map(r => r.valeur_fonciere).sort((a, b) => a - b)
          const median = values[Math.floor(values.length / 2)] ?? 0
          enrichment.patrimoine_immo_estime = median
          enrichment.sources_utilisees?.push('dvf')
        }
      }
    } catch {
      // DVF unavailable, skip
    }
  }

  return enrichment
}
```

- [ ] **Step 2: Créer `lib/enrichment/patrimony-scorer.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { ProspectEnrichmentData } from '@/lib/types'

const SCORING_PROMPT = (enrichment: ProspectEnrichmentData) => `Tu es expert en gestion de patrimoine (CGP) en France.

Analyse ce profil et estime le score patrimonial (0-100) et le patrimoine total estimé.

## Profil prospect
- Dirigeant: ${enrichment.dirigeant_prenom} ${enrichment.dirigeant_nom}, ${enrichment.dirigeant_qualite}
- Âge estimé: ${enrichment.dirigeant_annee_naissance ? new Date().getFullYear() - enrichment.dirigeant_annee_naissance + ' ans' : 'inconnu'}
- Entreprise: ${enrichment.code_naf} - ${enrichment.libelle_naf}
- Date création entreprise: ${enrichment.date_creation_entreprise ?? 'inconnue'}
- Effectifs: ${enrichment.tranche_effectifs ?? 'inconnu'}
- Localisation: ${enrichment.ville} (${enrichment.departement})

## Signaux BODACC (${enrichment.bodacc_events?.length ?? 0} événements)
${enrichment.bodacc_events?.map(e => `- ${e.date}: ${e.type} — ${e.libelle}`).join('\n') || 'Aucun'}

## Transactions immobilières zone (DVF)
${enrichment.dvf_transactions?.slice(0, 3).map(t => `- ${t.date_mutation}: ${t.nature_mutation} ${t.type_local} ${t.surface_reelle_bati ? t.surface_reelle_bati + 'm²' : ''} — ${t.valeur_fonciere.toLocaleString('fr-FR')}€ à ${t.commune}`).join('\n') || 'Aucune transaction connue'}

## Instructions
Réponds UNIQUEMENT en JSON valide, sans markdown:
{
  "score": <0-100>,
  "patrimoine_total_estime": <montant en euros ou null>,
  "valeur_entreprise_estimee": <montant en euros ou null>,
  "revenus_implicites_estimes": <montant annuel en euros ou null>,
  "niveau": <"faible" | "moyen" | "fort" | "prioritaire">,
  "raison_principale": "<1 phrase expliquant le score>"
}`

export async function scorePatrimony(enrichment: ProspectEnrichmentData): Promise<{
  score: number
  patrimoine_total_estime: number | null
  valeur_entreprise_estimee: number | null
  revenus_implicites_estimes: number | null
  niveau: 'faible' | 'moyen' | 'fort' | 'prioritaire'
  raison_principale: string
}> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: SCORING_PROMPT(enrichment) }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    const result = JSON.parse(cleaned)

    return {
      score: Math.min(100, Math.max(0, result.score ?? 30)),
      patrimoine_total_estime: result.patrimoine_total_estime ?? null,
      valeur_entreprise_estimee: result.valeur_entreprise_estimee ?? null,
      revenus_implicites_estimes: result.revenus_implicites_estimes ?? null,
      niveau: result.niveau ?? 'moyen',
      raison_principale: result.raison_principale ?? '',
    }
  } catch {
    return {
      score: 30,
      patrimoine_total_estime: null,
      valeur_entreprise_estimee: null,
      revenus_implicites_estimes: null,
      niveau: 'moyen',
      raison_principale: 'Données insuffisantes pour scoring précis',
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/enrichment/
git commit -m "feat: add enrichment pipeline (BODACC + DVF) and Claude patrimony scorer"
```

---

## Task 4 : API Routes

**Files:**
- Create: `app/api/prospects/search/route.ts`
- Create: `app/api/prospects/route.ts`
- Create: `app/api/prospects/[id]/route.ts`

- [ ] **Step 1: Créer `app/api/prospects/search/route.ts`**

POST : ICP criteria → search → enrich → save → return.

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchProspects } from '@/lib/prospect-search/engine'
import { enrichProspect } from '@/lib/enrichment/enricher'
import { scorePatrimony } from '@/lib/enrichment/patrimony-scorer'
import type { ParsedIcpCriteria } from '@/lib/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('prospection_organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 400 })

  const body = await request.json()
  const criteria: ParsedIcpCriteria = body.criteria
  if (!criteria) return NextResponse.json({ error: 'criteria required' }, { status: 400 })

  const limit = Math.min(body.limit ?? 20, 50)

  // 1. Recherche multi-sources
  const rawProspects = await searchProspects(criteria, { limit })

  // 2. Enrichissement + scoring pour chaque prospect
  const saved: string[] = []

  for (const raw of rawProspects) {
    // Vérifier si déjà en base (par linkedin_url = siren)
    const linkedinUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(raw.dirigeant_prenom + ' ' + raw.dirigeant_nom + ' ' + raw.entreprise_nom)}`

    const { data: existing } = await supabase
      .from('prospection_prospects')
      .select('id')
      .eq('org_id', membership.org_id)
      .eq('linkedin_url', linkedinUrl)
      .single()

    if (existing) {
      saved.push(existing.id)
      continue
    }

    // Enrichissement
    const enrichmentData = await enrichProspect(raw)
    const scoring = await scorePatrimony(enrichmentData)

    // Mise à jour enrichment avec les scores
    enrichmentData.valeur_entreprise_estimee = scoring.valeur_entreprise_estimee ?? undefined
    enrichmentData.revenus_implicites_estimes = scoring.revenus_implicites_estimes ?? undefined
    enrichmentData.patrimoine_total_estime = scoring.patrimoine_total_estime ?? undefined

    // Sauvegarder en base
    const linkedinData = {
      nom: `${raw.dirigeant_prenom} ${raw.dirigeant_nom}`,
      prenom: raw.dirigeant_prenom,
      nom_de_famille: raw.dirigeant_nom,
      titre: raw.dirigeant_qualite,
      entreprise: raw.entreprise_nom,
      ville: raw.ville,
      linkedin_search_url: raw.linkedin_search_url,
      niveau_patrimonial: scoring.niveau,
      raison_score: scoring.raison_principale,
    }

    const { data: prospect, error } = await supabase
      .from('prospection_prospects')
      .insert({
        org_id: membership.org_id,
        linkedin_url: linkedinUrl,
        linkedin_data: linkedinData,
        enrichment_data: enrichmentData,
        patrimony_score: scoring.score,
        icp_score: raw.score_initial,
        crm_stage: 'new',
        last_signal_at: enrichmentData.bodacc_events?.[0]?.date
          ? new Date(enrichmentData.bodacc_events[0].date).toISOString()
          : null,
      })
      .select('id')
      .single()

    if (!error && prospect) {
      saved.push(prospect.id)

      // Sauvegarder les signaux BODACC détectés
      if (enrichmentData.bodacc_events?.length) {
        const signalInserts = enrichmentData.bodacc_events
          .filter(e => e.type !== 'autre')
          .map(e => ({
            prospect_id: prospect.id,
            org_id: membership.org_id,
            type: mapBodaccToSignalType(e.type),
            source: 'bodacc' as const,
            data: { libelle: e.libelle, date_bodacc: e.date },
            detected_at: new Date(e.date).toISOString(),
          }))

        if (signalInserts.length > 0) {
          await supabase.from('prospection_signals').insert(signalInserts)
        }
      }
    }
  }

  return NextResponse.json({ count: saved.length, prospect_ids: saved })
}

function mapBodaccToSignalType(type: string): string {
  const map: Record<string, string> = {
    cession: 'cession_entreprise',
    creation: 'nouveau_poste',
    radiation: 'cession_entreprise',
    procedure_collective: 'cession_entreprise',
    modification: 'augmentation_capital',
  }
  return map[type] ?? 'cession_entreprise'
}
```

- [ ] **Step 2: Créer `app/api/prospects/route.ts`**

GET : liste paginée avec filtres.

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('prospection_organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 400 })

  const { searchParams } = new URL(request.url)
  const stage = searchParams.get('stage')
  const minScore = searchParams.get('min_score')
  const page = parseInt(searchParams.get('page') ?? '1')
  const perPage = Math.min(parseInt(searchParams.get('per_page') ?? '20'), 100)

  let query = supabase
    .from('prospection_prospects')
    .select('*', { count: 'exact' })
    .eq('org_id', membership.org_id)
    .order('patrimony_score', { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1)

  if (stage) query = query.eq('crm_stage', stage)
  if (minScore) query = query.gte('patrimony_score', parseInt(minScore))

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ prospects: data, total: count, page, per_page: perPage })
}
```

- [ ] **Step 3: Créer `app/api/prospects/[id]/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('prospection_prospects')
    .select('*, prospection_signals(*)')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ prospect: data })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { data, error } = await supabase
    .from('prospection_prospects')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prospect: data })
}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

Expected : 0 erreurs.

- [ ] **Step 5: Commit**

```bash
git add app/api/prospects/
git commit -m "feat: add prospects API routes (search, list, detail)"
```

---

## Task 5 : Page Prospects + Table UI

**Files:**
- Create: `components/prospects/patrimony-score-badge.tsx`
- Create: `components/prospects/signal-badge.tsx`
- Create: `components/prospects/search-launcher.tsx`
- Create: `components/prospects/prospect-table.tsx`
- Modify: `app/(app)/prospects/page.tsx`

- [ ] **Step 1: Créer `components/prospects/patrimony-score-badge.tsx`**

```typescript
'use client'

interface Props {
  score: number | null
  size?: 'sm' | 'md'
}

function getColor(score: number): string {
  if (score >= 80) return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (score >= 60) return 'bg-blue-100 text-blue-800 border-blue-200'
  if (score >= 40) return 'bg-amber-100 text-amber-800 border-amber-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

function getLabel(score: number): string {
  if (score >= 80) return 'Prioritaire'
  if (score >= 60) return 'Fort'
  if (score >= 40) return 'Moyen'
  return 'Faible'
}

export function PatrimonyScoreBadge({ score, size = 'md' }: Props) {
  if (score === null) return <span className="text-xs text-gray-400">—</span>
  const color = getColor(score)
  const label = getLabel(score)
  return (
    <span className={`inline-flex items-center gap-1 border rounded-full font-semibold ${color} ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'}`}>
      <span>{score}</span>
      <span className="font-normal opacity-70">{label}</span>
    </span>
  )
}
```

- [ ] **Step 2: Créer `components/prospects/signal-badge.tsx`**

```typescript
'use client'

const SIGNAL_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  cession_entreprise:   { label: 'Cession',         color: 'bg-red-100 text-red-700',     icon: '🏭' },
  levee_fonds:          { label: 'Levée de fonds',  color: 'bg-violet-100 text-violet-700', icon: '🚀' },
  creation_holding:     { label: 'Holding/SCI',     color: 'bg-blue-100 text-blue-700',   icon: '🏗️' },
  transaction_immo:     { label: 'Transaction immo', color: 'bg-green-100 text-green-700', icon: '🏠' },
  nouveau_poste:        { label: 'Nouveau poste',   color: 'bg-sky-100 text-sky-700',     icon: '💼' },
  installation_cabinet: { label: 'Installation',    color: 'bg-teal-100 text-teal-700',   icon: '🏥' },
  post_linkedin:        { label: 'Post LinkedIn',   color: 'bg-cyan-100 text-cyan-700',   icon: '📢' },
  retraite_imminente:   { label: 'Retraite',        color: 'bg-orange-100 text-orange-700', icon: '⏰' },
  divorce:              { label: 'Divorce',         color: 'bg-pink-100 text-pink-700',   icon: '⚖️' },
  succession:           { label: 'Succession',      color: 'bg-purple-100 text-purple-700', icon: '📜' },
  augmentation_capital: { label: 'Aug. capital',    color: 'bg-indigo-100 text-indigo-700', icon: '📈' },
}

interface Props {
  type: string
  size?: 'sm' | 'md'
}

export function SignalBadge({ type, size = 'sm' }: Props) {
  const config = SIGNAL_CONFIG[type] ?? { label: type, color: 'bg-gray-100 text-gray-700', icon: '📌' }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${config.color} ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'}`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  )
}
```

- [ ] **Step 3: Créer `components/prospects/search-launcher.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import type { ParsedIcpCriteria } from '@/lib/types'

interface Props {
  criteria: ParsedIcpCriteria
  onComplete: () => void
}

export function SearchLauncher({ criteria, onComplete }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ count: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSearch() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/prospects/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ criteria, limit: 30 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult({ count: data.count })
      onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-indigo-900">
          ICP configuré : {criteria.roles.join(', ')} — {criteria.locations.join(', ')}
        </p>
        {result && (
          <p className="text-xs text-indigo-600 mt-0.5">
            ✓ {result.count} prospects trouvés et enrichis
          </p>
        )}
        {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
      </div>
      <button
        onClick={handleSearch}
        disabled={loading}
        className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        {loading ? 'Recherche en cours...' : 'Lancer la recherche'}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Créer `components/prospects/prospect-table.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { ExternalLink, ChevronRight } from 'lucide-react'
import { PatrimonyScoreBadge } from './patrimony-score-badge'
import { SignalBadge } from './signal-badge'
import type { Prospect, ProspectEnrichmentData } from '@/lib/types'

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  new:        { label: 'Nouveau',    color: 'bg-gray-100 text-gray-700' },
  to_contact: { label: 'À contacter', color: 'bg-amber-100 text-amber-700' },
  contacted:  { label: 'Contacté',   color: 'bg-blue-100 text-blue-700' },
  meeting:    { label: 'RDV',        color: 'bg-purple-100 text-purple-700' },
  client:     { label: 'Client',     color: 'bg-emerald-100 text-emerald-700' },
  lost:       { label: 'Perdu',      color: 'bg-red-100 text-red-700' },
}

interface Props {
  prospects: Prospect[]
  onSelect: (prospect: Prospect) => void
}

export function ProspectTable({ prospects, onSelect }: Props) {
  if (prospects.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-lg font-medium">Aucun prospect</p>
        <p className="text-sm mt-1">Lancez une recherche depuis votre ICP pour trouver des prospects.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
            <th className="pb-3 pr-4">Prospect</th>
            <th className="pb-3 pr-4">Entreprise</th>
            <th className="pb-3 pr-4">Score patrimonial</th>
            <th className="pb-3 pr-4">Signaux</th>
            <th className="pb-3 pr-4">Stage</th>
            <th className="pb-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {prospects.map(prospect => {
            const ld = prospect.linkedin_data as Record<string, string>
            const ed = prospect.enrichment_data as ProspectEnrichmentData
            const stage = STAGE_LABELS[prospect.crm_stage] ?? STAGE_LABELS.new
            const signals = ed?.bodacc_events?.filter(e => e.type !== 'autre').slice(0, 2) ?? []

            return (
              <tr
                key={prospect.id}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => onSelect(prospect)}
              >
                <td className="py-3 pr-4">
                  <div>
                    <p className="font-medium text-gray-900">{ld?.nom ?? 'Prospect'}</p>
                    <p className="text-xs text-gray-500">{ld?.titre ?? ed?.dirigeant_qualite ?? '—'}</p>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <div>
                    <p className="text-gray-700">{ld?.entreprise ?? ed?.siren ?? '—'}</p>
                    <p className="text-xs text-gray-400">{ed?.ville} · {ed?.libelle_naf}</p>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <PatrimonyScoreBadge score={prospect.patrimony_score ?? null} />
                  {ed?.patrimoine_total_estime && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      ~{(ed.patrimoine_total_estime / 1_000_000).toFixed(1)}M€
                    </p>
                  )}
                </td>
                <td className="py-3 pr-4">
                  <div className="flex flex-wrap gap-1">
                    {signals.map((s, i) => (
                      <SignalBadge key={i} type={s.type} size="sm" />
                    ))}
                    {signals.length === 0 && <span className="text-xs text-gray-400">—</span>}
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${stage.color}`}>
                    {stage.label}
                  </span>
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    {ed?.linkedin_search_url && (
                      <a
                        href={ed.linkedin_search_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-blue-600 hover:text-blue-800"
                        title="Rechercher sur LinkedIn"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                    <ChevronRight size={14} className="text-gray-400" />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 5: Modifier `app/(app)/prospects/page.tsx`**

```typescript
import { createClient } from '@/lib/supabase/server'
import { ProspectsClientPage } from '@/components/prospects/prospects-client-page'

export default async function ProspectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let icp = null
  let prospects = []

  if (user) {
    const { data: membership } = await supabase
      .from('prospection_organization_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()

    if (membership) {
      const [icpResult, prospectsResult] = await Promise.all([
        supabase
          .from('prospection_icps')
          .select()
          .eq('org_id', membership.org_id)
          .eq('status', 'active')
          .single(),
        supabase
          .from('prospection_prospects')
          .select('*')
          .eq('org_id', membership.org_id)
          .order('patrimony_score', { ascending: false })
          .limit(50),
      ])
      icp = icpResult.data
      prospects = prospectsResult.data ?? []
    }
  }

  return <ProspectsClientPage icp={icp} initialProspects={prospects} />
}
```

- [ ] **Step 6: Créer `components/prospects/prospects-client-page.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { Users, RefreshCw } from 'lucide-react'
import { ProspectTable } from './prospect-table'
import { SearchLauncher } from './search-launcher'
import type { Icp, Prospect } from '@/lib/types'

interface Props {
  icp: Icp | null
  initialProspects: Prospect[]
}

export function ProspectsClientPage({ icp, initialProspects }: Props) {
  const [prospects, setProspects] = useState<Prospect[]>(initialProspects)
  const [selected, setSelected] = useState<Prospect | null>(null)

  async function refreshProspects() {
    const res = await fetch('/api/prospects?per_page=50')
    const data = await res.json()
    setProspects(data.prospects ?? [])
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={24} />
            Prospects
          </h1>
          <p className="text-gray-500 mt-1">{prospects.length} prospect{prospects.length > 1 ? 's' : ''} enrichis</p>
        </div>
        <button
          onClick={refreshProspects}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <RefreshCw size={14} />
          Actualiser
        </button>
      </div>

      {/* ICP Search Launcher */}
      {icp ? (
        <div className="mb-6">
          <SearchLauncher criteria={icp.parsed_criteria} onComplete={refreshProspects} />
        </div>
      ) : (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          Configurez d'abord votre ICP pour lancer une recherche de prospects.{' '}
          <a href="/icp" className="underline font-medium">Créer mon ICP →</a>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <ProspectTable prospects={prospects} onSelect={setSelected} />
      </div>

      {/* Detail panel placeholder */}
      {selected && (
        <div className="fixed inset-0 bg-black/20 z-50" onClick={() => setSelected(null)}>
          <div
            className="absolute right-0 top-0 h-full w-[480px] bg-white shadow-2xl overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6">
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700 text-sm mb-4">← Fermer</button>
              <pre className="text-xs bg-gray-50 p-4 rounded-lg overflow-x-auto">
                {JSON.stringify(selected, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: TypeScript check + commit**

```bash
npx tsc --noEmit
git add components/prospects/ app/\(app\)/prospects/
git commit -m "feat: add prospects page with table, score badges, signal badges, search launcher"
```

---

## Task 6 : Fiche prospect enrichie

**Files:**
- Create: `components/prospects/prospect-detail-sheet.tsx`
- Modify: `components/prospects/prospects-client-page.tsx`

- [ ] **Step 1: Créer `components/prospects/prospect-detail-sheet.tsx`**

Remplace le placeholder JSON dans `ProspectsClientPage`. Composant complet :

```typescript
'use client'
import { ExternalLink, Building2, MapPin, Calendar, TrendingUp, AlertTriangle, Home, Linkedin } from 'lucide-react'
import { PatrimonyScoreBadge } from './patrimony-score-badge'
import { SignalBadge } from './signal-badge'
import type { Prospect, ProspectEnrichmentData, BodaccEvent, DvfTransaction } from '@/lib/types'

const CRM_STAGES = ['new', 'to_contact', 'contacted', 'meeting', 'client', 'lost'] as const
const CRM_LABELS: Record<string, string> = {
  new: 'Nouveau', to_contact: 'À contacter', contacted: 'Contacté',
  meeting: 'RDV', client: 'Client', lost: 'Perdu',
}

interface Props {
  prospect: Prospect
  onClose: () => void
  onStageChange: (stage: string) => void
}

function euros(n: number | null | undefined): string {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M€`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K€`
  return `${n.toLocaleString('fr-FR')}€`
}

export function ProspectDetailSheet({ prospect, onClose, onStageChange }: Props) {
  const ld = prospect.linkedin_data as Record<string, string>
  const ed = prospect.enrichment_data as ProspectEnrichmentData
  const nom = ld?.nom ?? `${ed?.dirigeant_prenom ?? ''} ${ed?.dirigeant_nom ?? ''}`.trim() || 'Prospect'
  const titre = ld?.titre ?? ed?.dirigeant_qualite ?? '—'
  const entreprise = ld?.entreprise ?? ed?.siren ?? '—'

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={onClose}>
      <div
        className="h-full w-[520px] bg-white shadow-2xl overflow-y-auto flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="flex items-start justify-between mb-3">
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm">✕ Fermer</button>
            <PatrimonyScoreBadge score={prospect.patrimony_score ?? null} size="md" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">{nom}</h2>
          <p className="text-gray-600 mt-0.5">{titre}</p>
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
            <span className="flex items-center gap-1"><Building2 size={12} />{entreprise}</span>
            {ed?.ville && <span className="flex items-center gap-1"><MapPin size={12} />{ed.ville}</span>}
          </div>
          {/* CRM Stage */}
          <div className="flex gap-1 mt-4 flex-wrap">
            {CRM_STAGES.map(stage => (
              <button
                key={stage}
                onClick={() => onStageChange(stage)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  prospect.crm_stage === stage
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {CRM_LABELS[stage]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 p-6 space-y-6">
          {/* Cartographie patrimoniale */}
          {(ed?.patrimoine_total_estime || ed?.valeur_entreprise_estimee || ed?.revenus_implicites_estimes) && (
            <section>
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <TrendingUp size={14} className="text-indigo-600" />
                Cartographie patrimoniale estimée
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {ed?.valeur_entreprise_estimee && (
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-blue-800">{euros(ed.valeur_entreprise_estimee)}</p>
                    <p className="text-xs text-blue-600 mt-0.5">Valeur entreprise</p>
                  </div>
                )}
                {ed?.patrimoine_immo_estime && (
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-green-800">{euros(ed.patrimoine_immo_estime)}</p>
                    <p className="text-xs text-green-600 mt-0.5">Immo estimé</p>
                  </div>
                )}
                {ed?.revenus_implicites_estimes && (
                  <div className="bg-amber-50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-amber-800">{euros(ed.revenus_implicites_estimes)}/an</p>
                    <p className="text-xs text-amber-600 mt-0.5">Revenus estimés</p>
                  </div>
                )}
              </div>
              {ed?.patrimoine_total_estime && (
                <div className="mt-2 p-3 bg-indigo-50 rounded-lg text-center">
                  <p className="text-sm font-semibold text-indigo-900">Patrimoine total estimé : <span className="text-lg font-bold">{euros(ed.patrimoine_total_estime)}</span></p>
                </div>
              )}
              {ld?.raison_score && (
                <p className="text-xs text-gray-500 mt-2 italic">{ld.raison_score}</p>
              )}
            </section>
          )}

          {/* Données entreprise */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <Building2 size={14} className="text-gray-600" />
              Données entreprise
            </h3>
            <div className="space-y-2 text-sm">
              {ed?.siren && <div className="flex justify-between"><span className="text-gray-500">SIREN</span><span className="font-mono">{ed.siren}</span></div>}
              {ed?.libelle_naf && <div className="flex justify-between"><span className="text-gray-500">Activité</span><span>{ed.libelle_naf}</span></div>}
              {ed?.date_creation_entreprise && <div className="flex justify-between"><span className="text-gray-500">Créée le</span><span>{new Date(ed.date_creation_entreprise).toLocaleDateString('fr-FR')}</span></div>}
              {ed?.tranche_effectifs && <div className="flex justify-between"><span className="text-gray-500">Effectifs</span><span>{ed.tranche_effectifs} sal.</span></div>}
              {ed?.adresse_entreprise && <div className="flex justify-between gap-4"><span className="text-gray-500">Adresse</span><span className="text-right">{ed.adresse_entreprise}</span></div>}
            </div>
          </section>

          {/* Signaux BODACC */}
          {ed?.bodacc_events && ed.bodacc_events.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <AlertTriangle size={14} className="text-amber-600" />
                Signaux BODACC ({ed.bodacc_events.length})
              </h3>
              <div className="space-y-2">
                {ed.bodacc_events.slice(0, 5).map((event: BodaccEvent, i: number) => (
                  <div key={i} className="flex items-start gap-2">
                    <SignalBadge type={event.type} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700">{event.libelle}</p>
                      <p className="text-xs text-gray-400">{new Date(event.date).toLocaleDateString('fr-FR')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* DVF — transactions immobilières */}
          {ed?.dvf_transactions && ed.dvf_transactions.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <Home size={14} className="text-green-600" />
                Transactions immobilières zone
              </h3>
              <div className="space-y-2">
                {ed.dvf_transactions.slice(0, 3).map((t: DvfTransaction, i: number) => (
                  <div key={i} className="p-2 bg-green-50 rounded-lg text-xs">
                    <div className="flex justify-between font-medium">
                      <span>{t.type_local} {t.surface_reelle_bati ? `${t.surface_reelle_bati}m²` : ''}</span>
                      <span className="text-green-800 font-bold">{euros(t.valeur_fonciere)}</span>
                    </div>
                    <div className="text-gray-500 mt-0.5">{t.commune} · {new Date(t.date_mutation).toLocaleDateString('fr-FR')}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* LinkedIn */}
          {ed?.linkedin_search_url && (
            <section>
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <Linkedin size={14} className="text-blue-600" />
                LinkedIn
              </h3>
              <a
                href={ed.linkedin_search_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 p-3 bg-blue-50 rounded-lg border border-blue-100"
              >
                <ExternalLink size={14} />
                Rechercher {nom} sur LinkedIn
              </a>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Mettre à jour `components/prospects/prospects-client-page.tsx`**

Remplacer le bloc `{selected && ...}` par :

```typescript
{selected && (
  <ProspectDetailSheet
    prospect={selected}
    onClose={() => setSelected(null)}
    onStageChange={async (stage) => {
      await fetch(`/api/prospects/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crm_stage: stage }),
      })
      setSelected({ ...selected, crm_stage: stage as Prospect['crm_stage'] })
      setProspects(prev => prev.map(p => p.id === selected.id ? { ...p, crm_stage: stage as Prospect['crm_stage'] } : p))
    }}
  />
)}
```

Ajouter l'import en haut :
```typescript
import { ProspectDetailSheet } from './prospect-detail-sheet'
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected : 0 erreurs.

- [ ] **Step 4: Build complet**

```bash
npm run build
```

Expected : build sans erreurs.

- [ ] **Step 5: Commit final**

```bash
git add components/prospects/ app/\(app\)/prospects/
git commit -m "feat: add enriched prospect detail sheet with patrimony map, BODACC signals, DVF transactions"
git push
```
