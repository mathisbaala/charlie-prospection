# Cache Global des Personnes — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire un cache global cross-org `prospection_persons_cache` qui stocke toutes les personnes jamais découvertes et permet à `/api/recherche/run` de répondre depuis la base propre avant d'appeler Pappers/BODACC/RPPS.

**Architecture:** Nouvelle table PostgreSQL `prospection_persons_cache` sans RLS (service role uniquement), indexée par `(code_naf, departement)` pour les requêtes par critères et par `canonical_key` pour la dédup. La route `/api/recherche/run` interroge d'abord ce cache ; si le nombre de hits frais est insuffisant, elle complète en appelant les APIs externes, stocke les nouveaux résultats en fire-and-forget, puis retourne la liste combinée. Un cron hebdomadaire ré-enrichit les entrées devenues stales.

**Tech Stack:** Supabase PostgreSQL, TypeScript, Next.js App Router, `@supabase/supabase-js` (service role), modules existants `enrichProspect`, `scorePatrimony`, `inferDiscoveryParams`.

---

## File Map

| Statut | Chemin | Rôle |
|--------|--------|------|
| CREATE | `supabase/migrations/20260519000000_persons_cache.sql` | Schéma de la table + indexes |
| CREATE | `lib/persons-cache/constants.ts` | Seuil de staleness |
| CREATE | `lib/persons-cache/query.ts` | Lecture du cache par critères |
| CREATE | `lib/persons-cache/store.ts` | Écriture / upsert dans le cache |
| CREATE | `lib/persons-cache/__tests__/query.test.ts` | Tests unitaires query |
| CREATE | `lib/persons-cache/__tests__/store.test.ts` | Tests unitaires store |
| CREATE | `app/api/cron/refresh-persons-cache/route.ts` | Cron de ré-enrichissement |
| MODIFY | `app/api/recherche/run/route.ts` | Cache-first lookup + store |
| MODIFY | `vercel.ts` | Ajouter le cron au schedule |
| MODIFY | `OWNERSHIP.md` | Déclarer la nouvelle table |

---

## Task 1 — Migration : créer prospection_persons_cache

**Files:**
- Create: `supabase/migrations/20260519000000_persons_cache.sql`

- [ ] **Step 1: Écrire la migration**

```sql
-- supabase/migrations/20260519000000_persons_cache.sql

create table if not exists prospection_persons_cache (
  id uuid primary key default gen_random_uuid(),

  -- Clé de dédup (identique à RawProspect.uid = canonicalPersonKey)
  canonical_key text unique not null,

  -- Colonnes d'index pour le filtrage par critères
  siren          text,
  dirigeant_prenom text not null,
  dirigeant_nom    text not null,
  dirigeant_qualite text,
  dirigeant_annee_naissance integer,
  code_naf       text,
  departement    text,
  ville          text,

  -- Sources ayant découvert cette personne
  discovery_sources text[] not null default '{}',

  -- Blobs
  raw_data       jsonb not null,    -- snapshot RawProspect
  enrichment_data jsonb,            -- ProspectEnrichmentData (null = pas encore enrichi)

  -- Score patrimonial global (0-1000)
  patrimony_score integer,

  -- Niveau d'enrichissement
  enrichment_level text not null default 'raw'
    check (enrichment_level in ('raw', 'standard')),

  -- Horodatage du dernier enrichissement
  last_enriched_at timestamptz,

  created_at timestamptz not null default now()
);

-- Lookup principal : critères persona (NAF + dept)
create index idx_persons_cache_naf_dept
  on prospection_persons_cache(code_naf, departement)
  where code_naf is not null and departement is not null;

-- Lookup dept seul (quand pas de NAF inféré)
create index idx_persons_cache_dept
  on prospection_persons_cache(departement)
  where departement is not null;

-- Lookup SIREN (signal matching, enrichissement portfolio)
create index idx_persons_cache_siren
  on prospection_persons_cache(siren)
  where siren is not null;

-- Staleness check pour le cron de ré-enrichissement
create index idx_persons_cache_stale
  on prospection_persons_cache(last_enriched_at asc nulls last)
  where enrichment_level = 'standard';

-- Tri par score (retourner les meilleurs candidats en premier)
create index idx_persons_cache_score
  on prospection_persons_cache(patrimony_score desc nulls last)
  where patrimony_score is not null;

comment on table prospection_persons_cache is
  'Cache global cross-org. Toute personne jamais découverte y est stockée '
  'pour éviter les doublons d''appels API. Pas de RLS — accès service role '
  'uniquement. Le contexte org-specific (CRM, suivi) reste dans '
  'prospection_prospects.';
```

- [ ] **Step 2: Appliquer la migration en local**

```bash
npx supabase db push
```

Expected output: `Applied migration 20260519000000_persons_cache.sql`

- [ ] **Step 3: Vérifier que la table existe**

```bash
npx supabase db diff --schema public | grep persons_cache
```

Expected: au moins une ligne mentionnant `prospection_persons_cache`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260519000000_persons_cache.sql
git commit -m "feat(db): prospection_persons_cache — cache global cross-org des personnes"
```

---

## Task 2 — Constants

**Files:**
- Create: `lib/persons-cache/constants.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
// lib/persons-cache/constants.ts
export const ENRICHMENT_STALE_DAYS = 60
```

- [ ] **Step 2: Commit**

```bash
git add lib/persons-cache/constants.ts
git commit -m "feat(cache): constantes du cache global des personnes"
```

---

## Task 3 — Module de lecture : lib/persons-cache/query.ts

**Files:**
- Create: `lib/persons-cache/query.ts`
- Create: `lib/persons-cache/__tests__/query.test.ts`

- [ ] **Step 1: Écrire les tests en échec**

```typescript
// lib/persons-cache/__tests__/query.test.ts
import { buildCacheFilters, cacheRowToPartialCandidate } from '../query'

describe('buildCacheFilters', () => {
  it('renvoie naf et depts quand les deux sont fournis', () => {
    const f = buildCacheFilters(['86.21Z', '86.22Z'], ['69', '01', '38'])
    expect(f.nafCodes).toEqual(['86.21Z', '86.22Z'])
    expect(f.departements).toEqual(['69', '01', '38'])
  })

  it('nafCodes null quand tableau vide', () => {
    const f = buildCacheFilters([], ['69'])
    expect(f.nafCodes).toBeNull()
    expect(f.departements).toEqual(['69'])
  })

  it('departements null quand tableau vide', () => {
    const f = buildCacheFilters(['86.21Z'], [])
    expect(f.departements).toBeNull()
  })
})

describe('cacheRowToPartialCandidate', () => {
  const row = {
    canonical_key: 'jean|dupont|123456789',
    raw_data: {
      uid: 'jean|dupont|123456789',
      source: 'pappers',
      source_type: 'personne_morale',
      siren: '123456789',
      code_naf: '86.21Z',
      dirigeant_nom: 'Dupont',
      dirigeant_prenom: 'Jean',
      linkedin_search_url: 'https://linkedin.com',
      score_initial: 50,
    },
    enrichment_data: { siren: '123456789' },
    patrimony_score: 700,
    enrichment_level: 'standard',
    last_enriched_at: new Date(Date.now() - 10 * 86400 * 1000).toISOString(),
  }

  it('mappe correctement un hit fresh', () => {
    const hit = cacheRowToPartialCandidate(row as any)
    expect(hit.uid).toBe('jean|dupont|123456789')
    expect(hit.patrimony_score).toBe(700)
    expect(hit.needsEnrichment).toBe(false)
  })

  it('détecte un hit stale', () => {
    const staleRow = {
      ...row,
      last_enriched_at: new Date(Date.now() - 90 * 86400 * 1000).toISOString(),
    }
    const hit = cacheRowToPartialCandidate(staleRow as any)
    expect(hit.needsEnrichment).toBe(true)
  })
})
```

Exécuter:
```bash
npx jest lib/persons-cache/__tests__/query.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../query'`

- [ ] **Step 2: Implémenter le module**

```typescript
// lib/persons-cache/query.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RawProspect, SearchCandidate, ProspectEnrichmentData } from '@/lib/types'
import { ENRICHMENT_STALE_DAYS } from './constants'

export interface CacheFilters {
  nafCodes: string[] | null
  departements: string[] | null
}

export interface CacheHit {
  uid: string
  raw: RawProspect
  enrichment_data: ProspectEnrichmentData
  patrimony_score: number
  niveau: SearchCandidate['niveau']
  raison_principale: string
  needsEnrichment: boolean
}

export function buildCacheFilters(
  nafCodes: string[],
  departements: string[]
): CacheFilters {
  return {
    nafCodes: nafCodes.length > 0 ? nafCodes : null,
    departements: departements.length > 0 ? departements : null,
  }
}

export function cacheRowToPartialCandidate(row: {
  canonical_key: string
  raw_data: unknown
  enrichment_data: unknown
  patrimony_score: number | null
  enrichment_level: string
  last_enriched_at: string | null
}): CacheHit {
  const staleThreshold = new Date()
  staleThreshold.setDate(staleThreshold.getDate() - ENRICHMENT_STALE_DAYS)

  const isStale =
    row.last_enriched_at !== null &&
    new Date(row.last_enriched_at) < staleThreshold

  const needsEnrichment =
    row.enrichment_level === 'raw' ||
    row.enrichment_data === null ||
    isStale

  const score = row.patrimony_score ?? 0

  return {
    uid: row.canonical_key,
    raw: row.raw_data as RawProspect,
    enrichment_data: (row.enrichment_data ?? {}) as ProspectEnrichmentData,
    patrimony_score: score,
    niveau: scoreToNiveau(score),
    raison_principale:
      ((row.enrichment_data as Record<string, unknown>)?.raison_principale as string) ?? '',
    needsEnrichment,
  }
}

function scoreToNiveau(score: number): SearchCandidate['niveau'] {
  if (score >= 750) return 'prioritaire'
  if (score >= 500) return 'fort'
  if (score >= 250) return 'moyen'
  return 'faible'
}

export async function queryPersonsCache(
  supabase: SupabaseClient,
  filters: CacheFilters,
  limit: number
): Promise<CacheHit[]> {
  // Fetch 2× limit pour absorber les hits stales qu'on filtre ensuite
  let query = supabase
    .from('prospection_persons_cache')
    .select('canonical_key, raw_data, enrichment_data, patrimony_score, enrichment_level, last_enriched_at')
    .order('patrimony_score', { ascending: false, nullsFirst: false })
    .limit(limit * 2)

  if (filters.nafCodes) {
    query = query.in('code_naf', filters.nafCodes)
  }
  if (filters.departements) {
    query = query.in('departement', filters.departements)
  }

  const { data, error } = await query
  if (error || !data) return []

  return data.slice(0, limit).map(cacheRowToPartialCandidate)
}
```

- [ ] **Step 3: Vérifier que les tests passent**

```bash
npx jest lib/persons-cache/__tests__/query.test.ts --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 4: Commit**

```bash
git add lib/persons-cache/query.ts lib/persons-cache/__tests__/query.test.ts
git commit -m "feat(cache): module de lecture du cache global des personnes"
```

---

## Task 4 — Module d'écriture : lib/persons-cache/store.ts

**Files:**
- Create: `lib/persons-cache/store.ts`
- Create: `lib/persons-cache/__tests__/store.test.ts`

- [ ] **Step 1: Écrire les tests en échec**

```typescript
// lib/persons-cache/__tests__/store.test.ts
import { buildCacheRow } from '../store'
import type { RawProspect } from '@/lib/types'

const mockRaw: RawProspect = {
  uid: 'jean|dupont|123456789',
  source: 'pappers',
  source_type: 'personne_morale',
  entreprise_nom: 'DUPONT SAS',
  siren: '123456789',
  code_naf: '86.21Z',
  libelle_naf: 'Médecins généraux',
  date_creation: '2010-01-01',
  tranche_effectifs: '00',
  adresse: '1 rue de la Paix',
  code_postal: '75001',
  ville: 'Paris',
  departement: '75',
  dirigeant_nom: 'Dupont',
  dirigeant_prenom: 'Jean',
  dirigeant_qualite: 'Gérant',
  linkedin_search_url: 'https://www.linkedin.com/search/results/people/?keywords=jean+dupont',
  score_initial: 50,
}

describe('buildCacheRow', () => {
  it('construit une ligne avec enrichissement', () => {
    const row = buildCacheRow(mockRaw, { siren: '123456789' } as any, 700)
    expect(row.canonical_key).toBe('jean|dupont|123456789')
    expect(row.siren).toBe('123456789')
    expect(row.code_naf).toBe('86.21Z')
    expect(row.departement).toBe('75')
    expect(row.patrimony_score).toBe(700)
    expect(row.enrichment_level).toBe('standard')
    expect(row.discovery_sources).toEqual(['pappers'])
    expect(row.last_enriched_at).not.toBeNull()
  })

  it('construit une ligne raw sans enrichissement', () => {
    const row = buildCacheRow(mockRaw, null, null)
    expect(row.enrichment_level).toBe('raw')
    expect(row.enrichment_data).toBeNull()
    expect(row.patrimony_score).toBeNull()
    expect(row.last_enriched_at).toBeNull()
  })
})
```

Exécuter:
```bash
npx jest lib/persons-cache/__tests__/store.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '../store'`

- [ ] **Step 2: Implémenter le module**

```typescript
// lib/persons-cache/store.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RawProspect, ProspectEnrichmentData } from '@/lib/types'

interface CacheRow {
  canonical_key: string
  siren: string | null
  dirigeant_prenom: string
  dirigeant_nom: string
  dirigeant_qualite: string | null
  dirigeant_annee_naissance: number | null
  code_naf: string | null
  departement: string | null
  ville: string | null
  discovery_sources: string[]
  raw_data: RawProspect
  enrichment_data: ProspectEnrichmentData | null
  patrimony_score: number | null
  enrichment_level: 'raw' | 'standard'
  last_enriched_at: string | null
}

export function buildCacheRow(
  raw: RawProspect,
  enrichment: ProspectEnrichmentData | null,
  patrimonyScore: number | null
): CacheRow {
  return {
    canonical_key: raw.uid,
    siren: raw.siren || null,
    dirigeant_prenom: raw.dirigeant_prenom,
    dirigeant_nom: raw.dirigeant_nom,
    dirigeant_qualite: raw.dirigeant_qualite || null,
    dirigeant_annee_naissance: raw.dirigeant_annee_naissance ?? null,
    code_naf: raw.code_naf || null,
    departement: raw.departement || null,
    ville: raw.ville || null,
    discovery_sources: [raw.source],
    raw_data: raw,
    enrichment_data: enrichment,
    patrimony_score: patrimonyScore,
    enrichment_level: enrichment ? 'standard' : 'raw',
    last_enriched_at: enrichment ? new Date().toISOString() : null,
  }
}

/**
 * Upsert des personnes dans le cache global.
 * onConflict = 'canonical_key' → si la personne existe déjà, on met à jour
 * l'enrichissement et le score (données plus fraîches).
 */
export async function storePersonsToCache(
  supabase: SupabaseClient,
  persons: Array<{
    raw: RawProspect
    enrichment: ProspectEnrichmentData | null
    patrimonyScore: number | null
  }>
): Promise<void> {
  if (persons.length === 0) return

  const rows = persons.map(({ raw, enrichment, patrimonyScore }) =>
    buildCacheRow(raw, enrichment, patrimonyScore)
  )

  const { error } = await supabase
    .from('prospection_persons_cache')
    .upsert(rows, {
      onConflict: 'canonical_key',
      ignoreDuplicates: false,
    })

  if (error) {
    console.error('[persons-cache/store] upsert error:', error.message)
  }
}
```

- [ ] **Step 3: Vérifier que les tests passent**

```bash
npx jest lib/persons-cache/__tests__/store.test.ts --no-coverage
```

Expected: PASS (2 tests)

- [ ] **Step 4: Compiler TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 erreurs

- [ ] **Step 5: Commit**

```bash
git add lib/persons-cache/store.ts lib/persons-cache/__tests__/store.test.ts
git commit -m "feat(cache): module d'écriture du cache global des personnes"
```

---

## Task 5 — Modifier /api/recherche/run — Cache-first

**Files:**
- Modify: `app/api/recherche/run/route.ts`

La route fait actuellement 100% des appels en live. Après modification :
1. Requête cache → hits frais retournés directement, hits stales ré-enrichis
2. Appel externe seulement pour le `gap = limit - nb_hits_frais`
3. Store fire-and-forget après enrichissement

- [ ] **Step 1: Lire le fichier actuel pour vérifier les numéros de lignes**

Ouvrir `app/api/recherche/run/route.ts` et noter :
- Ligne 2 : `import { createClient } from '@/lib/supabase/server'`
- Ligne 12 : `import { runDiscovery, inferDiscoveryParams } from '@/lib/discovery'`
- Ligne 68 : `const criteria: ParsedIcpCriteria = ...`
- Ligne 76 : `const discoveryParams = inferDiscoveryParams(criteria)`
- Ligne 77-80 : `const [rawProspects, discoveryRaw] = await Promise.all([...])`
- Ligne 84-93 : bloc dedup `seenUids`
- Ligne 112-128 : bloc enrichissement `enrichResults`
- Ligne 130-152 : construction des `candidates`

- [ ] **Step 2: Ajouter les imports en tête de fichier**

Remplacer le bloc d'imports existant (lignes 1-13) par :

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { searchProspects } from '@/lib/prospect-search/engine'
import {
  aggregateDropReasons,
  assessProspectQuality,
  type QualityAssessment,
} from '@/lib/prospect-search/quality-filter'
import { enrichProspect } from '@/lib/enrichment/enricher'
import { scorePatrimony } from '@/lib/enrichment/patrimony-scorer'
import type { Icp, ParsedIcpCriteria, SearchCandidate, StrictFilters } from '@/lib/types'
import { runDiscovery, inferDiscoveryParams } from '@/lib/discovery'
import type { RawProspect } from '@/lib/prospect-search/engine'
import { buildCacheFilters, queryPersonsCache } from '@/lib/persons-cache/query'
import { storePersonsToCache } from '@/lib/persons-cache/store'
```

- [ ] **Step 3: Instancier le client service role après l'auth utilisateur**

Après la ligne `const strictFilters: StrictFilters = (persona as Icp).strict_filters ?? {}` (ligne 70), ajouter :

```typescript
  // Service role client pour le cache global (pas de RLS sur prospection_persons_cache)
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
```

- [ ] **Step 4: Remplacer le bloc "parallel search" (lignes 72-93) par la logique cache-first**

Remplacer le commentaire + le bloc `discoveryParams` + `Promise.all` + `seenUids` (lignes 72-93) par :

```typescript
  // ── 1. Cache-first lookup ──────────────────────────────────────────────────
  // On interroge d'abord notre base propre. Si le cache couvre le quota
  // demandé (fresh hits ≥ limit), on évite tout appel externe.
  const discoveryParams = inferDiscoveryParams(criteria)
  const nafCodes = [
    ...(discoveryParams.naf_codes ?? []),
    ...(discoveryParams.naf_code ? [discoveryParams.naf_code] : []),
  ]
  const depts = discoveryParams.departement ? [discoveryParams.departement] : []

  const cacheHits = await queryPersonsCache(
    serviceSupabase,
    buildCacheFilters(nafCodes, depts),
    limit
  )

  const cacheHitsFresh = cacheHits.filter((h) => !h.needsEnrichment)
  const cacheHitsStale = cacheHits.filter((h) => h.needsEnrichment)
  const cacheGap = limit - cacheHitsFresh.length

  // ── 2. Appel externe uniquement pour le gap ────────────────────────────────
  const cachedUids = new Set(cacheHits.map((h) => h.uid))
  let externalRaw: RawProspect[] = []

  if (cacheGap > 0) {
    const [rawProspects, discoveryRaw] = await Promise.all([
      searchProspects(criteria, { limit: cacheGap, strictFilters }),
      runDiscovery({ ...discoveryParams, limit: cacheGap }),
    ])

    // Dedup externe vs cache — ne pas ré-enrichir ce qu'on a déjà
    const seenUids = new Set<string>(cachedUids)
    for (const r of [...discoveryRaw, ...rawProspects]) {
      if (!seenUids.has(r.uid)) {
        seenUids.add(r.uid)
        externalRaw.push(r)
      }
    }
  }

  // Ré-enrichir les stales + enrichir les externes (même pipeline)
  const toEnrich: RawProspect[] = [
    ...cacheHitsStale.map((h) => h.raw),
    ...externalRaw,
  ]
```

- [ ] **Step 5: Remplacer la ligne cappedRaw (ligne 93) et l'early return (lignes 95-97)**

Remplacer :
```typescript
  const cappedRaw = allRaw.slice(0, limit)

  if (cappedRaw.length === 0) {
    return NextResponse.json({ candidates: [] })
  }
```

Par :
```typescript
  // Early return si cache complet ET aucun stale à ré-enrichir
  if (cacheHitsFresh.length >= limit && toEnrich.length === 0) {
    const existingUrls = cacheHitsFresh.map((h) => h.raw.linkedin_search_url).filter(Boolean)
    const { data: existing } = await supabase
      .from('prospection_prospects')
      .select('linkedin_url')
      .eq('org_id', membership.org_id)
      .in('linkedin_url', existingUrls)
    const existingSet = new Set((existing ?? []).map((r) => r.linkedin_url))

    const candidates: SearchCandidate[] = cacheHitsFresh.map((h) => ({
      uid: h.uid,
      raw: h.raw,
      enrichment_data: h.enrichment_data,
      patrimony_score: h.patrimony_score,
      icp_score: h.raw.score_initial,
      niveau: h.niveau,
      raison_principale: h.raison_principale,
      already_in_suivi:
        !!h.raw.linkedin_search_url && existingSet.has(h.raw.linkedin_search_url),
    }))
    candidates.sort((a, b) => b.patrimony_score - a.patrimony_score)
    return NextResponse.json({ candidates, filtered_count: 0, filter_breakdown: {} })
  }

  if (cacheHitsFresh.length === 0 && toEnrich.length === 0) {
    return NextResponse.json({ candidates: [] })
  }
```

- [ ] **Step 6: Remplacer la construction de `linkedinUrls` (lignes 99-106)**

Remplacer :
```typescript
  // Check which candidates are already in /suivi so the UI can disable them.
  const linkedinUrls = cappedRaw.map((r) => r.linkedin_search_url).filter(Boolean)
  const { data: existing } = await supabase
    .from('prospection_prospects')
    .select('linkedin_url')
    .eq('org_id', membership.org_id)
    .in('linkedin_url', linkedinUrls)
  const existingSet = new Set((existing ?? []).map((r) => r.linkedin_url))
```

Par :
```typescript
  const allUrls = [
    ...cacheHitsFresh.map((h) => h.raw.linkedin_search_url),
    ...toEnrich.map((r) => r.linkedin_search_url),
  ].filter(Boolean)
  const { data: existing } = await supabase
    .from('prospection_prospects')
    .select('linkedin_url')
    .eq('org_id', membership.org_id)
    .in('linkedin_url', allUrls)
  const existingSet = new Set((existing ?? []).map((r) => r.linkedin_url))
```

- [ ] **Step 7: Remplacer le bloc enrichissement (lignes 108-128)**

Remplacer :
```typescript
  const enrichResults = await Promise.allSettled(
    cappedRaw.map(async (raw) => {
      ...
    }),
  )
```

Par :
```typescript
  const enrichResults = await Promise.allSettled(
    toEnrich.map(async (raw) => {
      const enrichmentData = await enrichProspect(raw)
      const quality = assessProspectQuality(enrichmentData)
      if (quality.drop) {
        return { raw, enrichmentData, quality, dropped: true as const }
      }
      const scoring = await scorePatrimony(enrichmentData)
      enrichmentData.valeur_entreprise_estimee = scoring.valeur_entreprise_estimee ?? undefined
      enrichmentData.revenus_implicites_estimes = scoring.revenus_implicites_estimes ?? undefined
      enrichmentData.patrimoine_total_estime = scoring.patrimoine_total_estime ?? undefined
      enrichmentData.score_breakdown = scoring.breakdown
      enrichmentData.facteurs_cles = scoring.facteurs_cles
      return { raw, enrichmentData, scoring, dropped: false as const, quality }
    }),
  )

  // Fire-and-forget : stocker les nouvelles personnes + stales ré-enrichies
  const toStore = enrichResults
    .map((r, i) => {
      if (r.status === 'rejected' || r.value.dropped) return null
      const { raw, enrichmentData, scoring } = r.value as {
        raw: RawProspect
        enrichmentData: typeof r.value extends { enrichmentData: infer E } ? E : never
        scoring: Awaited<ReturnType<typeof scorePatrimony>>
      }
      return { raw, enrichment: enrichmentData, patrimonyScore: scoring.score }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  storePersonsToCache(serviceSupabase, toStore).catch((err) =>
    console.error('[recherche/run] cache store error:', err)
  )
```

- [ ] **Step 8: Remplacer la construction des candidates (lignes 130-152)**

Remplacer :
```typescript
  const candidates: SearchCandidate[] = []
  const droppedAssessments: QualityAssessment[] = []
  for (const result of enrichResults) {
    if (result.status === 'rejected') continue
    if (result.value.dropped) {
      droppedAssessments.push(result.value.quality)
      continue
    }
    const { raw, enrichmentData, scoring } = result.value
    candidates.push({
      uid: raw.uid,
      raw,
      enrichment_data: enrichmentData,
      patrimony_score: scoring.score,
      icp_score: raw.score_initial,
      niveau: scoring.niveau,
      raison_principale: scoring.raison_principale,
      already_in_suivi: !!raw.linkedin_search_url && existingSet.has(raw.linkedin_search_url),
    })
  }
```

Par :
```typescript
  const candidates: SearchCandidate[] = []
  const droppedAssessments: QualityAssessment[] = []

  // Candidats frais depuis le cache (pas ré-enrichis)
  for (const h of cacheHitsFresh) {
    candidates.push({
      uid: h.uid,
      raw: h.raw,
      enrichment_data: h.enrichment_data,
      patrimony_score: h.patrimony_score,
      icp_score: h.raw.score_initial,
      niveau: h.niveau,
      raison_principale: h.raison_principale,
      already_in_suivi: !!h.raw.linkedin_search_url && existingSet.has(h.raw.linkedin_search_url),
    })
  }

  // Candidats nouvellement enrichis (externes + stales)
  for (const result of enrichResults) {
    if (result.status === 'rejected') continue
    if (result.value.dropped) {
      droppedAssessments.push(result.value.quality)
      continue
    }
    const { raw, enrichmentData, scoring } = result.value
    candidates.push({
      uid: raw.uid,
      raw,
      enrichment_data: enrichmentData,
      patrimony_score: scoring.score,
      icp_score: raw.score_initial,
      niveau: scoring.niveau,
      raison_principale: scoring.raison_principale,
      already_in_suivi: !!raw.linkedin_search_url && existingSet.has(raw.linkedin_search_url),
    })
  }
```

- [ ] **Step 9: Compiler TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 erreurs

- [ ] **Step 10: Commit**

```bash
git add app/api/recherche/run/route.ts
git commit -m "feat(recherche): cache-first — base propre avant Pappers/BODACC/RPPS"
```

---

## Task 6 — Cron de ré-enrichissement hebdomadaire

**Files:**
- Create: `app/api/cron/refresh-persons-cache/route.ts`
- Modify: `vercel.ts`

- [ ] **Step 1: Créer la route cron**

```typescript
// app/api/cron/refresh-persons-cache/route.ts
// Ré-enrichit les entrées stales du cache global des personnes.
// Cadence : chaque lundi à 03:00 UTC — en dehors des fenêtres de quota
// quotidien (Pappers quota = mensuel, pas de conflit).
// Batch : 30 entrées max par run pour rester sous le timeout de 300s.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { enrichProspect } from '@/lib/enrichment/enricher'
import { scorePatrimony } from '@/lib/enrichment/patrimony-scorer'
import type { RawProspect } from '@/lib/prospect-search/engine'
import { ENRICHMENT_STALE_DAYS } from '@/lib/persons-cache/constants'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function unauthorized() {
  return new NextResponse('Unauthorized', { status: 401 })
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return unauthorized()

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const staleThreshold = new Date()
  staleThreshold.setDate(staleThreshold.getDate() - ENRICHMENT_STALE_DAYS)

  const { data: stale, error } = await supabase
    .from('prospection_persons_cache')
    .select('canonical_key, raw_data')
    .eq('enrichment_level', 'standard')
    .lt('last_enriched_at', staleThreshold.toISOString())
    .order('patrimony_score', { ascending: false, nullsFirst: false })
    .limit(30)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!stale?.length) {
    return NextResponse.json({ refreshed: 0, total: 0 })
  }

  const results = await Promise.allSettled(
    stale.map(async (row) => {
      const raw = row.raw_data as RawProspect
      const enrichmentData = await enrichProspect(raw)
      const scoring = await scorePatrimony(enrichmentData)

      await supabase
        .from('prospection_persons_cache')
        .update({
          enrichment_data: enrichmentData,
          patrimony_score: scoring.score,
          last_enriched_at: new Date().toISOString(),
        })
        .eq('canonical_key', row.canonical_key)
    })
  )

  const succeeded = results.filter((r) => r.status === 'fulfilled').length
  return NextResponse.json({ refreshed: succeeded, total: stale.length })
}
```

- [ ] **Step 2: Ajouter le cron dans vercel.ts**

Dans le tableau `crons`, après la ligne `refresh-rpps`, ajouter :

```typescript
    { path: '/api/cron/refresh-persons-cache', schedule: '0 3 * * 1' },  // Lundi 03:00 UTC
```

- [ ] **Step 3: Compiler TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 erreurs

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/refresh-persons-cache/route.ts vercel.ts
git commit -m "feat(cron): ré-enrichissement hebdomadaire du cache global des personnes"
```

---

## Task 7 — Mettre à jour OWNERSHIP.md

**Files:**
- Modify: `OWNERSHIP.md`

- [ ] **Step 1: Ajouter la table dans la section Mathis**

Dans `OWNERSHIP.md`, dans la liste des tables appartenant à Mathis (Intelligence layer), ajouter après `prospection_signals_inbox` :

```markdown
- `prospection_persons_cache` — cache global cross-org, service role uniquement (lecture + écriture depuis `/api/recherche/run` et le cron `refresh-persons-cache`)
```

- [ ] **Step 2: Commit**

```bash
git add OWNERSHIP.md
git commit -m "chore(ownership): prospection_persons_cache → Intelligence layer (Mathis)"
```

---

## Vérification end-to-end

1. **Migration** : `npx supabase db push` passe sans erreur ; table visible dans le dashboard Supabase
2. **Tests unitaires** :
   ```bash
   npx jest lib/persons-cache/ --no-coverage
   ```
   Expected: 5 tests PASS

3. **TypeScript** :
   ```bash
   npx tsc --noEmit
   ```
   Expected: 0 erreurs

4. **Cache froid (première recherche)** : POST `/api/recherche/run` avec une persona → réponse correcte + `prospection_persons_cache` contient de nouvelles lignes

5. **Cache chaud (deuxième recherche identique)** : même persona re-lancée → le log serveur ne montre plus d'appels Pappers ; `cacheHitsFresh.length > 0`

6. **Dédup** : même personne trouvée via BODACC + Pappers → une seule ligne dans `prospection_persons_cache` (contrainte unique sur `canonical_key`)

7. **Quota Pappers** : vérifier `prospection_api_quota` après deux recherches identiques → le compteur Pappers n'a pas doublé
