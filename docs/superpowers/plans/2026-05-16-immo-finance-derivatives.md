# Patrimoine immobilier + Dérivées financières UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrichir la fiche patrimoniale avec (A) les biens immobiliers détenus via les sociétés du prospect — via Cerema DV3F + inférence achat/vente — et (B) afficher les dérivées financières déjà calculées (trajectoire, croissance, D/E) dans la section Finances.

**Architecture:** Nouvelle source `lib/data-sources/cerema.ts` + param `depth` dans `enrichProspect` pour déclencher les appels Cerema uniquement au `/suivi/add`. Résultats stockés dans `enrichment_data.patrimoine_immo` (JSONB existant, pas de nouvelle table). Feature B = UI only sur `prospect-fiche-content.tsx`.

**Tech Stack:** TypeScript, vitest, Next.js App Router, Supabase JSONB, Cerema DV3F API, Lucide icons, design tokens CSS vars.

---

## File Map

| Fichier | Action |
|---|---|
| `lib/types.ts` | Modifier — ajouter `CeremaHolding`, `PatrimoineImmo`, étendre `ProspectEnrichmentData` |
| `lib/data-sources/cerema.ts` | Créer — client Cerema DV3F + logique inférence |
| `lib/data-sources/__tests__/cerema.test.ts` | Créer — tests unitaires `inferHoldings` |
| `lib/enrichment/enricher.ts` | Modifier — param `opts.depth`, étape 2 Cerema post-portfolio |
| `app/api/suivi/add/route.ts` | Modifier — passer `{ depth: true }` à `enrichProspect` |
| `components/prospects/prospect-fiche-content.tsx` | Modifier — dérivées financières UI + section patrimoine immo |

---

## Task 1 — Types : CeremaHolding, PatrimoineImmo

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1 : Ajouter les types après `FinanceDerivatives` (ligne ~190)**

Ouvrir `lib/types.ts`. Après la fermeture de `FinanceDerivatives` (ligne ~190, avant `BeneficiaireEffectif`), insérer :

```ts
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
```

- [ ] **Step 2 : Ajouter `patrimoine_immo` dans `ProspectEnrichmentData`**

Dans `ProspectEnrichmentData` (ligne ~279-295), juste après `pappers_premium?: PappersPremiumData`, ajouter :

```ts
  patrimoine_immo?: PatrimoineImmo
```

- [ ] **Step 3 : Vérifier que TypeScript compile**

```bash
cd /Users/mathisbaala/Projects/charlie\ financial\ advisor/charlie-prospection
npx tsc --noEmit 2>&1 | head -20
```

Expected : aucune erreur.

- [ ] **Step 4 : Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): CeremaHolding + PatrimoineImmo"
```

---

## Task 2 — Cerema DV3F : découverte API + client

**Files:**
- Create: `lib/data-sources/cerema.ts`

> **Prérequis avant de coder :** Créer un compte sur https://data.cerema.fr, obtenir une clé API.
> Vérifier la doc live à https://apidf.cerema.fr/api/schema/redoc/ pour confirmer :
> - L'URL exacte de l'endpoint mutations
> - Les noms exacts des query params SIREN (buyer/seller)
> - Les noms exacts des champs dans la réponse (id parcelle, adresse, surface, type de bien)
>
> Les noms ci-dessous correspondent au schéma DVF+ connu de Cerema — adapter si la doc live diffère.

- [ ] **Step 1 : Créer `lib/data-sources/cerema.ts`**

```ts
import { timedFetch } from '@/lib/observability/logger'
import type { CeremaHolding } from '@/lib/types'

const BASE = 'https://apidf.cerema.fr/api/ff'

export interface CeremaMutationRaw {
  idmutation: string
  datemut: string           // "YYYY-MM-DD"
  valeurfonc: number
  sbati?: number
  l_idpar?: string[]        // identifiants parcelle(s)
  l_adresse?: string[]      // adresse(s) concernées
  libtypbien?: string       // "Appartement", "Maison", "Local industriel"...
  siren_acheteur1?: string
  siren_vendeur1?: string
}

interface MutationsPage {
  count: number
  next: string | null
  results: CeremaMutationRaw[]
}

export async function fetchMutationsBySiren(
  siren: string,
  token: string,
): Promise<CeremaMutationRaw[]> {
  const headers = { Authorization: `Bearer ${token}` }

  const [buyerRes, sellerRes] = await Promise.allSettled([
    timedFetch('cerema', 'fetchBuyer',
      `${BASE}/mutations/?siren_acheteur1=${siren}&ordering=-datemut&page_size=50`,
      { headers }),
    timedFetch('cerema', 'fetchSeller',
      `${BASE}/mutations/?siren_vendeur1=${siren}&ordering=-datemut&page_size=50`,
      { headers }),
  ])

  const results: CeremaMutationRaw[] = []
  const seen = new Set<string>()

  if (buyerRes.status === 'fulfilled' && buyerRes.value.ok) {
    const data: MutationsPage = await buyerRes.value.json()
    for (const r of data.results ?? []) {
      seen.add(r.idmutation)
      results.push({ ...r, siren_acheteur1: siren })
    }
  }

  if (sellerRes.status === 'fulfilled' && sellerRes.value.ok) {
    const data: MutationsPage = await sellerRes.value.json()
    for (const r of data.results ?? []) {
      if (!seen.has(r.idmutation)) {
        results.push({ ...r, siren_vendeur1: siren })
      }
    }
  }

  return results
}

function normalizeAddr(s: string | undefined): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function inferHoldings(
  mutations: CeremaMutationRaw[],
  siren: string,
  entiteNom: string,
): CeremaHolding[] {
  if (mutations.length === 0) return []

  const buys = mutations.filter(m => m.siren_acheteur1 === siren)
  const sells = mutations.filter(m => m.siren_vendeur1 === siren)

  const soldKeys = new Set<string>()
  for (const s of sells) {
    for (const p of s.l_idpar ?? []) soldKeys.add(p)
    const addr = normalizeAddr(s.l_adresse?.[0])
    if (addr && (s.l_idpar ?? []).length === 0) soldKeys.add(addr)
  }

  const now = new Date()
  const holdings: CeremaHolding[] = []

  for (const buy of buys) {
    const adresse = buy.l_adresse?.[0] ?? ''
    const id_parcelle = buy.l_idpar?.[0]
    const lookupKey = id_parcelle ?? normalizeAddr(adresse)
    const isSold = lookupKey ? soldKeys.has(lookupKey) : false

    const ageYears =
      (now.getTime() - new Date(buy.datemut).getTime()) / (1000 * 60 * 60 * 24 * 365)

    let confidence: 'high' | 'medium' | 'low'
    if (id_parcelle && !isSold && ageYears < 5) confidence = 'high'
    else if (id_parcelle && !isSold) confidence = 'medium'
    else confidence = 'low'

    holdings.push({
      siren,
      entite_nom: entiteNom,
      adresse,
      type_local: buy.libtypbien,
      surface_bati: buy.sbati,
      date_achat: buy.datemut,
      prix_achat: buy.valeurfonc,
      id_parcelle,
      confidence,
      statut: isSold ? 'vendu' : 'detenu',
    })
  }

  return holdings.sort((a, b) => b.date_achat.localeCompare(a.date_achat))
}
```

- [ ] **Step 2 : Vérifier TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected : aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add lib/data-sources/cerema.ts
git commit -m "feat(cerema): client DV3F — fetchMutationsBySiren + inferHoldings"
```

---

## Task 3 — Tests unitaires `inferHoldings`

**Files:**
- Create: `lib/data-sources/__tests__/cerema.test.ts`

- [ ] **Step 1 : Écrire les tests**

```ts
import { describe, it, expect } from 'vitest'
import { inferHoldings } from '../cerema'
import type { CeremaMutationRaw } from '../cerema'

const SIREN = '123456789'
const NOM = 'SCI TEST'

function makeBuy(overrides: Partial<CeremaMutationRaw> = {}): CeremaMutationRaw {
  return {
    idmutation: 'buy1',
    datemut: '2022-06-15',
    valeurfonc: 300000,
    sbati: 80,
    l_idpar: ['75001_0001_P_00001'],
    l_adresse: ['12 RUE DE RIVOLI PARIS'],
    libtypbien: 'Appartement',
    siren_acheteur1: SIREN,
    ...overrides,
  }
}

function makeSell(overrides: Partial<CeremaMutationRaw> = {}): CeremaMutationRaw {
  return {
    idmutation: 'sell1',
    datemut: '2024-03-10',
    valeurfonc: 380000,
    l_idpar: ['75001_0001_P_00001'],
    l_adresse: ['12 RUE DE RIVOLI PARIS'],
    siren_vendeur1: SIREN,
    ...overrides,
  }
}

describe('inferHoldings', () => {
  it('returns empty array for no mutations', () => {
    expect(inferHoldings([], SIREN, NOM)).toEqual([])
  })

  it('marks a bought parcel as detenu when not sold', () => {
    const result = inferHoldings([makeBuy()], SIREN, NOM)
    expect(result).toHaveLength(1)
    expect(result[0].statut).toBe('detenu')
    expect(result[0].prix_achat).toBe(300000)
    expect(result[0].entite_nom).toBe(NOM)
  })

  it('marks a parcel as vendu when matching sell exists by id_parcelle', () => {
    const result = inferHoldings([makeBuy(), makeSell()], SIREN, NOM)
    expect(result).toHaveLength(1)
    expect(result[0].statut).toBe('vendu')
  })

  it('marks as vendu when sell matches by normalized address (no id_parcelle)', () => {
    const buy = makeBuy({ l_idpar: [], l_adresse: ['12 RUE DE RIVOLI PARIS'] })
    const sell = makeSell({ l_idpar: [], l_adresse: ['12 Rue de Rivoli  Paris'] })
    const result = inferHoldings([buy, sell], SIREN, NOM)
    expect(result[0].statut).toBe('vendu')
  })

  it('assigns high confidence for recent parcel with id_parcelle not sold', () => {
    const recentBuy = makeBuy({ datemut: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) })
    const result = inferHoldings([recentBuy], SIREN, NOM)
    expect(result[0].confidence).toBe('high')
  })

  it('assigns medium confidence for old parcel with id_parcelle not sold', () => {
    const oldBuy = makeBuy({ datemut: '2015-01-01' })
    const result = inferHoldings([oldBuy], SIREN, NOM)
    expect(result[0].confidence).toBe('medium')
  })

  it('assigns low confidence when no id_parcelle', () => {
    const buy = makeBuy({ l_idpar: [] })
    const result = inferHoldings([buy], SIREN, NOM)
    expect(result[0].confidence).toBe('low')
  })

  it('ignores sell mutations from other SIRENs', () => {
    const sell = makeSell({ siren_vendeur1: '999999999', l_idpar: ['75001_0001_P_00001'] })
    const result = inferHoldings([makeBuy(), sell], SIREN, NOM)
    expect(result[0].statut).toBe('detenu')
  })

  it('returns holdings sorted by date descending', () => {
    const buy1 = makeBuy({ idmutation: 'b1', datemut: '2020-01-01', l_idpar: ['PAR1'] })
    const buy2 = makeBuy({ idmutation: 'b2', datemut: '2023-06-15', l_idpar: ['PAR2'] })
    const result = inferHoldings([buy1, buy2], SIREN, NOM)
    expect(result[0].date_achat).toBe('2023-06-15')
    expect(result[1].date_achat).toBe('2020-01-01')
  })
})
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils passent**

```bash
npx vitest run lib/data-sources/__tests__/cerema.test.ts
```

Expected : 9 tests PASS.

- [ ] **Step 3 : Commit**

```bash
git add lib/data-sources/__tests__/cerema.test.ts
git commit -m "test(cerema): inferHoldings — 9 cas (statut, confiance, tri)"
```

---

## Task 4 — Dérivées financières UI

**Files:**
- Modify: `components/prospects/prospect-fiche-content.tsx`

- [ ] **Step 1 : Ajouter l'import du type `FinanceDerivatives`**

En haut de `components/prospects/prospect-fiche-content.tsx`, dans le bloc import de `@/lib/types`, ajouter `FinanceDerivatives` et `CeremaHolding` (en prévision de Task 6) :

```ts
import type {
  Prospect,
  ProspectEnrichmentData,
  BodaccEvent,
  DvfTransaction,
  PatrimonyScoreBreakdown,
  FinanceDerivatives,
  CeremaHolding,
  PatrimoineImmo,
} from '@/lib/types'
```

- [ ] **Step 2 : Ajouter le composant `TrajectoryBadge`**

Après les constantes en haut du fichier (après `BREAKDOWN_LABELS`), ajouter :

```tsx
function TrajectoryBadge({ trajectory }: { trajectory: FinanceDerivatives['ca_trajectory'] }) {
  const config: Record<
    string,
    { label: string; color: string; bg: string }
  > = {
    growth:   { label: '↑ Croissance', color: '#2d6a2d', bg: '#eaf4ea' },
    stable:   { label: '→ Stable',     color: 'var(--color-muted)', bg: 'var(--color-bg)' },
    decline:  { label: '↓ Déclin',     color: '#8b1a1a', bg: '#fdf0f0' },
    volatile: { label: '~ Volatile',   color: '#7a4800', bg: '#fdf6e3' },
    unknown:  { label: '— Données insuffisantes', color: 'var(--color-muted)', bg: 'var(--color-bg)' },
  }
  const c = config[trajectory] ?? config['unknown']
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 2,
        fontSize: 11,
        fontWeight: 600,
        color: c.color,
        background: c.bg,
      }}
    >
      {c.label}
    </span>
  )
}
```

- [ ] **Step 3 : Insérer le bloc dérivées dans la section "Finances entreprise"**

Dans la section "Finances entreprise" (autour de la ligne 202), après la balise fermante de `{ed.finances.length > 1 && (...)}` et avant `{ed.capital_social && (...)}`, ajouter :

```tsx
          {ed.finance_derivatives && ed.finance_derivatives.years_available > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="flex items-center" style={{ gap: 8 }}>
                <TrajectoryBadge trajectory={ed.finance_derivatives.ca_trajectory} />
                <span
                  className="font-mono"
                  style={{ fontSize: 11, color: 'var(--color-muted)', fontVariantNumeric: 'tabular-nums' }}
                >
                  {ed.finance_derivatives.ca_growth_yoy != null &&
                    `CA ${ed.finance_derivatives.ca_growth_yoy >= 0 ? '+' : ''}${ed.finance_derivatives.ca_growth_yoy}% YoY`}
                  {ed.finance_derivatives.ca_growth_3y_cagr != null &&
                    ` · CAGR 3y ${ed.finance_derivatives.ca_growth_3y_cagr >= 0 ? '+' : ''}${ed.finance_derivatives.ca_growth_3y_cagr}%`}
                </span>
              </div>
              {ed.finance_derivatives.debt_to_equity != null &&
                ed.finance_derivatives.debt_to_equity > 1.5 && (
                  <p style={{ fontSize: 11, color: '#8b1a1a', marginTop: 2 }}>
                    ⚠ Endettement élevé (D/E {ed.finance_derivatives.debt_to_equity})
                  </p>
                )}
              {ed.finance_derivatives.fonds_propres_growth_pct != null &&
                ed.finance_derivatives.fonds_propres_growth_pct > 30 && (
                  <p style={{ fontSize: 11, color: '#2d6a2d', marginTop: 2 }}>
                    ↑ Fonds propres +{ed.finance_derivatives.fonds_propres_growth_pct}% — accumulation patrimoniale active
                  </p>
                )}
            </div>
          )}
```

- [ ] **Step 4 : Vérifier TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected : aucune erreur.

- [ ] **Step 5 : Commit**

```bash
git add components/prospects/prospect-fiche-content.tsx
git commit -m "feat(fiche): dérivées financières — trajectoire, CAGR, D/E dans section Finances"
```

---

## Task 5 — Enricher : param `depth` + intégration Cerema

**Files:**
- Modify: `lib/enrichment/enricher.ts`

- [ ] **Step 1 : Ajouter l'import et l'interface opts**

En haut de `lib/enrichment/enricher.ts`, après les imports existants, ajouter :

```ts
import { fetchMutationsBySiren, inferHoldings } from '@/lib/data-sources/cerema'
import type { CeremaHolding, PatrimoineImmo, PersonalPortfolio } from '@/lib/types'
```

- [ ] **Step 2 : Modifier la signature de `enrichProspect`**

Changer :
```ts
export async function enrichProspect(raw: RawProspect): Promise<ProspectEnrichmentData> {
```
En :
```ts
export async function enrichProspect(
  raw: RawProspect,
  opts?: { depth?: boolean },
): Promise<ProspectEnrichmentData> {
```

- [ ] **Step 3 : Ajouter et exporter la fonction helper `buildPatrimoineImmo`**

Avant `enrichProspect`, ajouter (noter le `export` — suivi/add l'appellera directement) :

```ts
export async function buildPatrimoineImmo(
  portfolio: PersonalPortfolio,
  mainSiren: string | undefined,
): Promise<PatrimoineImmo | null> {
  const token = process.env.CEREMA_API_TOKEN
  if (!token) return null

  const entities = portfolio.entites.slice(0, 10)  // cap sécurité

  const results = await Promise.allSettled(
    entities.map(e => fetchMutationsBySiren(e.siren, token)),
  )

  const allHoldings: CeremaHolding[] = []
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.status === 'fulfilled') {
      const holdings = inferHoldings(r.value, entities[i].siren, entities[i].nom_entreprise)
      allHoldings.push(...holdings)
    }
  }

  if (allHoldings.length === 0) return null

  const sorted = [...allHoldings].sort((a, b) => b.date_achat.localeCompare(a.date_achat))

  return {
    holdings: sorted,
    nb_biens_estimes: sorted.filter(h => h.statut === 'detenu').length,
    derniere_transaction: sorted[0]?.date_achat,
  }
}
```

- [ ] **Step 4 : Appeler `buildPatrimoineImmo` à la fin de `enrichProspect`**

Juste avant `return enrichment` (ligne ~414), ajouter :

```ts
  // ── Patrimoine immobilier (depth only — /suivi/add) ────────────────────────
  if (opts?.depth && enrichment.personal_portfolio) {
    try {
      const patrimoineImmo = await buildPatrimoineImmo(
        enrichment.personal_portfolio,
        enrichment.siren,
      )
      if (patrimoineImmo) {
        enrichment.patrimoine_immo = patrimoineImmo
        enrichment.sources_utilisees?.push('cerema_dvf')
      }
    } catch {
      // Cerema unavailable — skip silently
    }
  }
```

- [ ] **Step 5 : Vérifier TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected : aucune erreur.

- [ ] **Step 6 : Lancer les tests existants pour s'assurer que rien n'est cassé**

```bash
npx vitest run lib/ 2>&1 | tail -20
```

Expected : tous les tests passent.

- [ ] **Step 7 : Commit**

```bash
git add lib/enrichment/enricher.ts
git commit -m "feat(enricher): param depth + Cerema DV3F portfolio immo au suivi"
```

---

## Task 6 — suivi/add : activer depth

**Files:**
- Modify: `app/api/suivi/add/route.ts`

- [ ] **Step 1 : Ajouter l'import de `buildPatrimoineImmo`**

En haut de `app/api/suivi/add/route.ts`, ajouter :

```ts
import { buildPatrimoineImmo } from '@/lib/enrichment/enricher'
```

- [ ] **Step 2 : Appeler `buildPatrimoineImmo` post-insertion**

`suivi/add` reçoit les candidats déjà enrichis depuis `/recherche/run` — le `personal_portfolio` est déjà dans `enrichment_data`. On appelle `buildPatrimoineImmo` directement avec les données existantes, pas besoin de re-fetch.

Après l'insertion du prospect dans la DB (autour ligne ~116, après `prospectId = inserted.id`), ajouter :

```ts
    // Deep enrichment : patrimoine immo via Cerema DV3F.
    // personal_portfolio est déjà dans enrichment_data — on appelle buildPatrimoineImmo
    // directement sans re-fetch Pappers/BODACC. Awaité car Vercel coupe la fonction
    // dès le return de la réponse (pas de background execution garantie).
    if (prospectId && candidate.enrichment_data?.personal_portfolio) {
      try {
        const patrimoineImmo = await buildPatrimoineImmo(
          candidate.enrichment_data.personal_portfolio,
          candidate.enrichment_data.siren,
        )
        if (patrimoineImmo) {
          const merged = {
            ...(candidate.enrichment_data ?? {}),
            patrimoine_immo: patrimoineImmo,
            sources_utilisees: [
              ...((candidate.enrichment_data?.sources_utilisees ?? [])),
              'cerema_dvf',
            ],
          }
          await supabase
            .from('prospection_prospects')
            .update({ enrichment_data: merged })
            .eq('id', prospectId)
        }
      } catch (err) {
        console.error('[suivi/add] Cerema depth enrichment failed:', err)
      }
    }
```

- [ ] **Step 3 : Vérifier TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected : aucune erreur.

- [ ] **Step 4 : Commit**

```bash
git add app/api/suivi/add/route.ts
git commit -m "feat(suivi/add): deep enrichment Cerema DV3F post-insertion"
```

---

## Task 7 — UI : section Patrimoine immobilier

**Files:**
- Modify: `components/prospects/prospect-fiche-content.tsx`

- [ ] **Step 1 : Ajouter le composant `ConfidenceDot`**

Après `TrajectoryBadge`, ajouter :

```tsx
function ConfidenceDot({ confidence }: { confidence: CeremaHolding['confidence'] }) {
  const color =
    confidence === 'high' ? 'var(--color-accent)' :
    confidence === 'medium' ? '#888' : '#bbb'
  return (
    <span
      title={confidence === 'high' ? 'Haute confiance' : confidence === 'medium' ? 'Confiance moyenne' : 'Confiance faible'}
      style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }}
    />
  )
}
```

- [ ] **Step 2 : Ajouter le state `showVendus`**

Au début du composant principal `ProspectFicheContent`, après la ligne `const ed = prospect.enrichment_data as ProspectEnrichmentData`, ajouter :

```ts
  const [showVendus, setShowVendus] = React.useState(false)
```

Ajouter `React` dans les imports si pas déjà présent (Next.js le fait automatiquement en RSC mais c'est un client component donc `'use client'` est déjà là — vérifier que `React` est importé ou utiliser `useState` directement depuis `'react'`).

En haut du fichier, s'assurer que React est importé :
```ts
import { useState } from 'react'
```

Et remplacer `React.useState` par `useState`.

- [ ] **Step 3 : Ajouter la section patrimoine immo après la section DVF perso**

Après la section `{/* DVF perso — candidats matchant l'adresse du siège */}` (fermeture ~ligne 520), ajouter :

```tsx
      {/* Patrimoine immobilier — biens détenus via les sociétés du dirigeant */}
      {ed?.patrimoine_immo && ed.patrimoine_immo.nb_biens_estimes > 0 && (
        <Section icon={<Building2 size={13} />} label="Patrimoine immobilier">
          <p
            style={{
              fontSize: 11,
              color: 'var(--color-muted)',
              marginBottom: 10,
              fontWeight: 500,
            }}
          >
            {ed.patrimoine_immo.nb_biens_estimes} bien{ed.patrimoine_immo.nb_biens_estimes > 1 ? 's' : ''} estimé{ed.patrimoine_immo.nb_biens_estimes > 1 ? 's' : ''}
            {ed.patrimoine_immo.valeur_comptable_totale != null &&
              ` · Valeur comptable ${euros(ed.patrimoine_immo.valeur_comptable_totale)}`}
          </p>

          {/* Grouper par entité */}
          {(() => {
            const byEntity = new Map<string, { nom: string; holdings: CeremaHolding[] }>()
            for (const h of (ed.patrimoine_immo as PatrimoineImmo).holdings) {
              if (h.statut === 'vendu' && !showVendus) continue
              const existing = byEntity.get(h.siren)
              if (existing) {
                existing.holdings.push(h)
              } else {
                byEntity.set(h.siren, { nom: h.entite_nom, holdings: [h] })
              }
            }
            return Array.from(byEntity.entries()).map(([siren, { nom, holdings }]) => (
              <div key={siren} style={{ marginBottom: 12 }}>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--color-text)',
                    marginBottom: 6,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {nom}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {holdings.map((h, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '10px 12px',
                        background: h.statut === 'vendu' ? 'var(--color-bg)' : 'var(--color-bg)',
                        border: '1px solid var(--color-border)',
                        borderLeft: `2px solid ${h.statut === 'vendu' ? 'var(--color-border)' : 'var(--color-accent)'}`,
                        opacity: h.statut === 'vendu' ? 0.6 : 1,
                      }}
                    >
                      <div className="flex items-center justify-between" style={{ gap: 8 }}>
                        <div className="flex items-center" style={{ gap: 6 }}>
                          <ConfidenceDot confidence={h.confidence} />
                          <span style={{ fontSize: 12, color: 'var(--color-text)', fontWeight: 500 }}>
                            {h.type_local ?? 'Bien'}
                            {h.surface_bati ? ` · ${h.surface_bati}m²` : ''}
                            {h.statut === 'vendu' && (
                              <span style={{ color: 'var(--color-muted)', fontWeight: 400 }}> (vendu)</span>
                            )}
                          </span>
                        </div>
                        <span
                          className="font-mono"
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: 'var(--color-accent)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {euros(h.prix_achat)}
                        </span>
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>
                        {h.adresse}
                        {h.adresse && ' · '}
                        Acheté {new Date(h.date_achat).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          })()}

          {/* Toggle cessions */}
          {(ed.patrimoine_immo as PatrimoineImmo).holdings.some(h => h.statut === 'vendu') && (
            <button
              onClick={() => setShowVendus(v => !v)}
              style={{
                marginTop: 4,
                fontSize: 11,
                color: 'var(--color-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              {showVendus
                ? 'Masquer les cessions'
                : `Voir aussi ${(ed.patrimoine_immo as PatrimoineImmo).holdings.filter(h => h.statut === 'vendu').length} cession(s)`}
            </button>
          )}

          <p
            style={{
              fontSize: 10,
              color: 'var(--color-muted)',
              fontStyle: 'italic',
              marginTop: 10,
              lineHeight: 1.5,
            }}
          >
            Transactions DVF enregistrées depuis 2014. Actifs antérieurs non visibles sauf via valeur comptable bilan.
          </p>
        </Section>
      )}
```

- [ ] **Step 4 : Vérifier TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected : aucune erreur.

- [ ] **Step 5 : Commit**

```bash
git add components/prospects/prospect-fiche-content.tsx
git commit -m "feat(fiche): section Patrimoine immobilier — holdings Cerema par entité + toggle cessions"
```

---

## Task 8 — Variable d'environnement + smoke test

- [ ] **Step 1 : Poser `CEREMA_API_TOKEN` sur Vercel**

Une fois le compte Cerema créé et la clé API obtenue :

```bash
vercel env add CEREMA_API_TOKEN
# → entrer la valeur, sélectionner Production + Preview + Development
```

- [ ] **Step 2 : Smoke test local**

Avec la clé posée dans `.env.local` :

```bash
node -e "
const token = process.env.CEREMA_API_TOKEN
fetch('https://apidf.cerema.fr/api/ff/mutations/?siren_acheteur1=552032534&page_size=5', {
  headers: { Authorization: \`Bearer \${token}\` }
}).then(r => r.json()).then(d => console.log('count:', d.count, 'fields:', Object.keys(d.results?.[0] ?? {})))
"
```

Expected : affiche `count: N` et la liste des champs. Si les noms de champs diffèrent de ceux dans `cerema.ts` (ex: `valeurfonc` vs `valeur_fonciere`), mettre à jour `CeremaMutationRaw` et les tests.

- [ ] **Step 3 : Tester en ajoutant un prospect au suivi**

Ajouter manuellement un prospect via `/recherche` → `/suivi`. Après quelques secondes (fire-and-forget), vérifier en base :

```sql
SELECT enrichment_data->'patrimoine_immo' 
FROM prospection_prospects 
WHERE id = '<prospect_id>';
```

Expected : JSON non-null avec `holdings` si le SIREN a des transactions DVF.

- [ ] **Step 4 : Lancer tous les tests**

```bash
npx vitest run 2>&1 | tail -20
```

Expected : tous les tests passent.

- [ ] **Step 5 : Commit final**

```bash
git add .env.local  # si modifié — ne PAS commit les vraies clés
git commit -m "chore(env): doc CEREMA_API_TOKEN — smoke test OK"
```
