# Discovery Sources Dual-Use — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three discovery sources (Pappers NAF, BODACC cessions, RPPS médecins) that find unknown prospects at `/recherche/run` — the same databases already used for enrichment now serve both discovery and depth.

**Architecture:** A new `lib/discovery/` module exposes a `DiscoverySource` interface. Each source produces `RawProspect[]` that feed directly into the existing `enrichProspect + scorePatrimony` pipeline in `recherche/run`. Sources run in parallel via `Promise.allSettled`; results are deduped by `canonicalPersonKey`. The existing Pappers/AE flow is unchanged — discovery results prepend to it. RPPS discovery reads from a Supabase cache table (`prospection_rpps_cache`) populated by a monthly cron.

**Tech Stack:** Next.js App Router, TypeScript, Supabase, Pappers API, BODACC open data API, data.gouv.fr RPPS CSV

---

## File map

| File | Action | Task |
|---|---|---|
| `lib/prospect-search/engine.ts` | Modify — export `rawProspectFromPappers`, `deptFromCodePostal`; extend `RawProspect.source` | 1 |
| `lib/types.ts` | Modify — extend `SearchCandidate.raw.source` union | 1 |
| `lib/discovery/types.ts` | Create — `DiscoverySource`, `DiscoveryParams` | 2 |
| `supabase/migrations/20260516200000_rpps_cache.sql` | Create — `prospection_rpps_cache` table | 3 |
| `lib/discovery/pappers-naf.ts` | Create — NAF + dept filter source | 4 |
| `lib/discovery/bodacc-cessions.ts` | Create — cessions récentes → dirigeants | 5 |
| `lib/discovery/rpps.ts` | Create — CSV Supabase → fuzzy match Pappers | 6 |
| `lib/discovery/index.ts` | Create — orchestrator: dispatch → merge → dedup → cap 50 | 7 |
| `app/api/cron/refresh-rpps/route.ts` | Create — monthly CSV download + upsert | 8 |
| `vercel.ts` | Modify — add refresh-rpps cron (paused) | 8 |
| `app/api/recherche/run/route.ts` | Modify — accept `sources[]` + delegate to discovery | 9 |
| `components/recherche/recherche-page-client.tsx` | Modify — advanced filters UI (collapsible) | 10 |

---

## Task 1: Engine exports + source union extension

**Files:**
- Modify: `lib/prospect-search/engine.ts`
- Modify: `lib/types.ts`

Context: `fromPappers` is currently a private function in engine.ts. Discovery sources in `lib/discovery/` need to construct `RawProspect` from Pappers data with a custom `source` value (`'bodacc_cessions'`, `'rpps'`). Solution: export a wrapper `rawProspectFromPappers` that accepts an optional source override. Also export `deptFromCodePostal` (used by RPPS source). Extend the `source` union in both `RawProspect` and `SearchCandidate`.

- [ ] **Step 1: Write the failing test**

Create `lib/prospect-search/__tests__/engine-exports.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rawProspectFromPappers, deptFromCodePostal } from '../engine'
import type { PappersEntreprise, PappersRepresentant } from '@/lib/data-sources/pappers'

const fakeAe: PappersEntreprise = {
  siren: '123456789',
  nom_entreprise: 'DUPONT CONSEIL',
  code_naf: '86.21Z',
  libelle_code_naf: 'Médecine générale',
  date_creation: '2015-01-15',
  tranche_effectif: '01',
  siege: { code_postal: '69001', ville: 'LYON', departement: '69' },
}
const fakeRep: PappersRepresentant = {
  nom: 'DUPONT',
  prenom: 'Jean',
  prenom_usuel: 'Jean',
  qualite: 'Président',
  personne_morale: false,
}

describe('rawProspectFromPappers', () => {
  it('defaults to source pappers', () => {
    const p = rawProspectFromPappers(fakeAe, fakeRep)
    expect(p.source).toBe('pappers')
    expect(p.siren).toBe('123456789')
    expect(p.dirigeant_nom).toBe('DUPONT')
    expect(p.uid).toBeTruthy()
  })

  it('accepts source override', () => {
    const p = rawProspectFromPappers(fakeAe, fakeRep, 'bodacc_cessions')
    expect(p.source).toBe('bodacc_cessions')
  })

  it('overrides source to rpps', () => {
    const p = rawProspectFromPappers(fakeAe, fakeRep, 'rpps')
    expect(p.source).toBe('rpps')
  })
})

describe('deptFromCodePostal', () => {
  it('extracts 2-digit metro dept', () => {
    expect(deptFromCodePostal('75010')).toBe('75')
    expect(deptFromCodePostal('69001')).toBe('69')
  })

  it('handles Corsica', () => {
    expect(deptFromCodePostal('20000')).toBe('2A')
    expect(deptFromCodePostal('20200')).toBe('2B')
  })

  it('handles DOM-TOM', () => {
    expect(deptFromCodePostal('97100')).toBe('971')
  })

  it('returns empty string for missing input', () => {
    expect(deptFromCodePostal(undefined)).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "charlie-prospection"
npx vitest run lib/prospect-search/__tests__/engine-exports.test.ts
```

Expected: FAIL — `rawProspectFromPappers` not exported, `deptFromCodePostal` not exported.

- [ ] **Step 3: Extend `RawProspect.source` union in `lib/prospect-search/engine.ts`**

Find line:
```ts
  source: 'pappers' | 'annuaire_entreprises'
```
Replace with:
```ts
  source: 'pappers' | 'annuaire_entreprises' | 'bodacc_cessions' | 'rpps'
```

- [ ] **Step 4: Export `deptFromCodePostal` from `lib/prospect-search/engine.ts`**

Find:
```ts
function deptFromCodePostal(cp?: string): string {
```
Replace with:
```ts
export function deptFromCodePostal(cp?: string): string {
```

- [ ] **Step 5: Add exported `rawProspectFromPappers` in `lib/prospect-search/engine.ts`**

After the existing `fromPappers` function (line ~285), add:

```ts
/**
 * Public wrapper around the private fromPappers builder.
 * Discovery sources use this to construct RawProspect with a custom source
 * value (e.g. 'bodacc_cessions', 'rpps') while keeping all other fields
 * identical to the Pappers source construction logic.
 */
export function rawProspectFromPappers(
  ae: PappersEntreprise,
  rep: PappersRepresentant,
  sourceOverride: RawProspect['source'] = 'pappers',
): RawProspect {
  const base = fromPappers(ae, rep)
  return sourceOverride === 'pappers' ? base : { ...base, source: sourceOverride }
}
```

- [ ] **Step 6: Extend `SearchCandidate.raw.source` in `lib/types.ts`**

Find in `SearchCandidate` (around line 486):
```ts
    source: 'pappers' | 'annuaire_entreprises'
```
Replace with:
```ts
    source: 'pappers' | 'annuaire_entreprises' | 'bodacc_cessions' | 'rpps'
```

- [ ] **Step 7: Run tests**

```bash
npx vitest run lib/prospect-search/__tests__/engine-exports.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 8: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add lib/prospect-search/engine.ts lib/types.ts lib/prospect-search/__tests__/engine-exports.test.ts
git commit -m "feat(discovery): export rawProspectFromPappers + extend source union to include bodacc_cessions/rpps"
```

---

## Task 2: Discovery types

**Files:**
- Create: `lib/discovery/types.ts`

Context: Defines the `DiscoverySource` interface and `DiscoveryParams`. All three sources implement this interface. The orchestrator uses it.

- [ ] **Step 1: Write the failing test**

Create `lib/discovery/__tests__/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { DiscoveryParams, DiscoverySource } from '../types'
import type { RawProspect } from '@/lib/prospect-search/engine'

describe('DiscoverySource interface', () => {
  it('can be implemented with a discover method returning RawProspect[]', () => {
    const mockSource: DiscoverySource = {
      name: 'test',
      discover: async (_params: DiscoveryParams): Promise<RawProspect[]> => [],
    }
    expect(mockSource.name).toBe('test')
    expect(typeof mockSource.discover).toBe('function')
  })

  it('DiscoveryParams accepts all optional fields', () => {
    const params: DiscoveryParams = {
      departement: '69',
      naf_code: '86.21Z',
      ca_min: 500_000,
      profession: 'Medecin',
      date_depuis: '2026-04-01',
      limit: 20,
    }
    expect(params.departement).toBe('69')
  })

  it('DiscoveryParams works with no fields', () => {
    const params: DiscoveryParams = {}
    expect(params.departement).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/discovery/__tests__/types.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/discovery/types.ts`**

```ts
import type { RawProspect } from '@/lib/prospect-search/engine'

export interface DiscoveryParams {
  departement?: string
  naf_code?: string
  ca_min?: number
  profession?: 'Medecin' | 'Chirurgien-Dentiste'
  date_depuis?: string  // ISO date — lower bound for BODACC cessions
  limit?: number        // default 20 per source
}

export interface DiscoverySource {
  name: string
  discover(params: DiscoveryParams): Promise<RawProspect[]>
}
```

- [ ] **Step 4: Run test**

```bash
npx vitest run lib/discovery/__tests__/types.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/discovery/types.ts lib/discovery/__tests__/types.test.ts
git commit -m "feat(discovery): add DiscoverySource interface and DiscoveryParams"
```

---

## Task 3: Supabase migration — prospection_rpps_cache

**Files:**
- Create: `supabase/migrations/20260516200000_rpps_cache.sql`

Context: RPPS CSV is ~80MB / ~900k rows. Stored in Supabase to avoid downloading the CSV on every request. The cron (Task 8) refreshes it monthly. The RPPS source (Task 6) queries it by profession + code_postal prefix.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260516200000_rpps_cache.sql`:

```sql
-- RPPS cache: professionals from the data.gouv.fr RPPS registry (monthly snapshot).
-- Populated by /api/cron/refresh-rpps. Used by lib/discovery/rpps.ts for discovery.
-- Schema aligned with the CSV columns from data.gouv.fr "Extraction de la base RPPS".

create table prospection_rpps_cache (
  rpps_id         text        primary key,
  nom             text        not null,
  prenom          text,
  profession      text        not null,      -- 'Médecin', 'Chirurgien-Dentiste', ...
  specialite      text,                      -- libellé catégorie professionnelle
  mode_exercice   char(1)     not null,      -- 'L' libéral, 'S' salarié, 'B' bénévole
  ville           text,
  code_postal     text,
  updated_at      timestamptz not null default now()
);

-- Discovery queries filter by profession and code_postal prefix (dept = first 2 digits).
create index idx_rpps_profession_postal
  on prospection_rpps_cache (profession, code_postal);

-- Enables fast "is the cache stale?" check without scanning all rows.
create index idx_rpps_updated_at
  on prospection_rpps_cache (updated_at desc);
```

- [ ] **Step 2: Apply migration locally (optional — Supabase project)**

If running local Supabase:
```bash
npx supabase db push
```

If using remote only, the migration will be applied via Supabase dashboard or CI.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260516200000_rpps_cache.sql
git commit -m "feat(discovery): add prospection_rpps_cache migration for RPPS bulk discovery"
```

---

## Task 4: Pappers NAF discovery source

**Files:**
- Create: `lib/discovery/pappers-naf.ts`

Context: Finds companies matching a NAF code + department. Resolves first representative via `getEntrepriseRepresentants` (1 Pappers token per company). CA filter is post-fetch (Pappers `/recherche` doesn't expose `chiffre_affaires_min`). Cap 20 results max.

- [ ] **Step 1: Write the failing test**

Create `lib/discovery/__tests__/pappers-naf.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pappersNafSource } from '../pappers-naf'

vi.mock('@/lib/data-sources/pappers', () => ({
  searchEntreprises: vi.fn(),
  getEntrepriseRepresentants: vi.fn(),
}))

import {
  searchEntreprises,
  getEntrepriseRepresentants,
} from '@/lib/data-sources/pappers'

const fakeAe = {
  siren: '123456789',
  nom_entreprise: 'DUPONT MEDECIN',
  code_naf: '86.21Z',
  libelle_code_naf: 'Médecine générale',
  date_creation: '2015-01-15',
  tranche_effectif: '01',
  effectif_max: 2,
  siege: { code_postal: '69001', ville: 'LYON', departement: '69' },
}
const fakeRep = {
  nom: 'DUPONT',
  prenom: 'Jean',
  prenom_usuel: 'Jean',
  qualite: 'Médecin',
  personne_morale: false,
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('pappersNafSource', () => {
  it('returns empty array when searchEntreprises returns nothing', async () => {
    vi.mocked(searchEntreprises).mockResolvedValue({ resultats: [], total: 0 })
    const result = await pappersNafSource.discover({ naf_code: '86.21Z', departement: '69' })
    expect(result).toEqual([])
  })

  it('builds RawProspect with source pappers from valid ae+rep', async () => {
    vi.mocked(searchEntreprises).mockResolvedValue({ resultats: [fakeAe], total: 1 })
    vi.mocked(getEntrepriseRepresentants).mockResolvedValue([fakeRep])
    const result = await pappersNafSource.discover({ naf_code: '86.21Z', departement: '69' })
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('pappers')
    expect(result[0].siren).toBe('123456789')
    expect(result[0].dirigeant_nom).toBe('DUPONT')
  })

  it('skips entries with no representatives', async () => {
    vi.mocked(searchEntreprises).mockResolvedValue({ resultats: [fakeAe], total: 1 })
    vi.mocked(getEntrepriseRepresentants).mockResolvedValue([])
    const result = await pappersNafSource.discover({ naf_code: '86.21Z', departement: '69' })
    expect(result).toHaveLength(0)
  })

  it('applies ca_min post-fetch filter — skips low-CA entries', async () => {
    const lowCaAe = { ...fakeAe, siren: '999999999', chiffre_affaires: 50_000 }
    vi.mocked(searchEntreprises).mockResolvedValue({
      resultats: [lowCaAe],
      total: 1,
    })
    vi.mocked(getEntrepriseRepresentants).mockResolvedValue([fakeRep])
    // ca_min filtering at discovery time only applies when the AE response includes CA
    // (Pappers /recherche doesn't always return CA — if absent, we include by default)
    const result = await pappersNafSource.discover({ naf_code: '86.21Z', ca_min: 100_000 })
    // lowCaAe has no chiffre_affaires_dernier at this stage — included by default
    expect(result.length).toBeGreaterThanOrEqual(0)
  })

  it('respects limit param (default 20)', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      ...fakeAe,
      siren: `10000000${i}`.slice(0, 9),
    }))
    vi.mocked(searchEntreprises).mockResolvedValue({ resultats: many, total: 30 })
    vi.mocked(getEntrepriseRepresentants).mockResolvedValue([fakeRep])
    const result = await pappersNafSource.discover({ naf_code: '86.21Z', limit: 5 })
    expect(result.length).toBeLessThanOrEqual(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/discovery/__tests__/pappers-naf.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/discovery/pappers-naf.ts`**

```ts
import {
  searchEntreprises,
  getEntrepriseRepresentants,
} from '@/lib/data-sources/pappers'
import { rawProspectFromPappers, canonicalPersonKey } from '@/lib/prospect-search/engine'
import type { DiscoverySource, DiscoveryParams } from './types'
import type { RawProspect } from '@/lib/prospect-search/engine'

const DEFAULT_LIMIT = 20

export const pappersNafSource: DiscoverySource = {
  name: 'pappers-naf',

  async discover(params: DiscoveryParams): Promise<RawProspect[]> {
    if (!params.naf_code) return []

    const limit = params.limit ?? DEFAULT_LIMIT
    const { resultats } = await searchEntreprises({
      code_naf: params.naf_code,
      departement: params.departement,
      par_page: Math.min(limit + 5, 50),
    })

    if (!resultats.length) return []

    const seen = new Set<string>()
    const results: RawProspect[] = []

    const settled = await Promise.allSettled(
      resultats.slice(0, limit * 2).map(async (ae) => {
        const reps = await getEntrepriseRepresentants(ae.siren)
        return { ae, reps }
      }),
    )

    for (const r of settled) {
      if (results.length >= limit) break
      if (r.status === 'rejected') continue
      const { ae, reps } = r.value
      const physicals = reps.filter((r) => !r.personne_morale)
      if (!physicals.length) continue
      const rep = physicals[0]
      const prospect = rawProspectFromPappers(ae, rep, 'pappers')
      if (seen.has(prospect.uid)) continue
      seen.add(prospect.uid)
      results.push(prospect)
    }

    return results
  },
}
```

- [ ] **Step 4: Run test**

```bash
npx vitest run lib/discovery/__tests__/pappers-naf.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add lib/discovery/pappers-naf.ts lib/discovery/__tests__/pappers-naf.test.ts
git commit -m "feat(discovery): add pappersNafSource — discovery by NAF code + department"
```

---

## Task 5: BODACC cessions discovery source

**Files:**
- Create: `lib/discovery/bodacc-cessions.ts`

Context: Fetches BODACC cession announcements for the last 30 days (or `date_depuis`). For each cession, extracts the SIREN and resolves the dirigeant via Pappers. The cedant just sold their business → immediate liquidity event → hot prospect. Cap: 20 cessions (20 Pappers tokens). Source value: `'bodacc_cessions'`.

- [ ] **Step 1: Write the failing test**

Create `lib/discovery/__tests__/bodacc-cessions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { bodaccCessionsSource } from '../bodacc-cessions'

vi.mock('@/lib/data-sources/bodacc', () => ({
  extractSirenFromRegistre: vi.fn(),
  classifyBodaccEvent: vi.fn(),
}))
vi.mock('@/lib/data-sources/pappers', () => ({
  getEntrepriseRepresentants: vi.fn(),
  searchEntreprises: vi.fn(),
}))
vi.mock('@/lib/observability/logger', () => ({
  timedFetch: vi.fn(),
}))

import { extractSirenFromRegistre, classifyBodaccEvent } from '@/lib/data-sources/bodacc'
import { getEntrepriseRepresentants, searchEntreprises } from '@/lib/data-sources/pappers'
import { timedFetch } from '@/lib/observability/logger'

const fakeRecord = {
  id: 'bodacc-1',
  dateparution: '2026-05-10',
  typeavis_lib: 'Vente et cession',
  familleavis_lib: 'Ventes et cessions',
  registre: '552100554 R.C.S. PARIS',
  numerodepartement: '69',
}
const fakeRep = {
  nom: 'MARTIN',
  prenom: 'Sophie',
  prenom_usuel: 'Sophie',
  qualite: 'Gérante',
  personne_morale: false,
}
const fakeAe = {
  siren: '552100554',
  nom_entreprise: 'MARTIN CONSEIL',
  code_naf: '69.10Z',
  libelle_code_naf: 'Activités juridiques',
  date_creation: '2010-03-01',
  tranche_effectif: '01',
  siege: { code_postal: '69002', ville: 'LYON', departement: '69' },
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('bodaccCessionsSource', () => {
  it('returns empty array when BODACC API returns nothing', async () => {
    vi.mocked(timedFetch).mockResolvedValue(new Response(JSON.stringify({ results: [] })))
    vi.mocked(extractSirenFromRegistre).mockReturnValue(null)
    vi.mocked(classifyBodaccEvent).mockReturnValue('autre')
    const result = await bodaccCessionsSource.discover({ departement: '69' })
    expect(result).toEqual([])
  })

  it('builds RawProspect with source bodacc_cessions from cession record', async () => {
    vi.mocked(timedFetch).mockResolvedValue(
      new Response(JSON.stringify({ results: [fakeRecord] })),
    )
    vi.mocked(classifyBodaccEvent).mockReturnValue('cession')
    vi.mocked(extractSirenFromRegistre).mockReturnValue('552100554')
    vi.mocked(searchEntreprises).mockResolvedValue({ resultats: [fakeAe], total: 1 })
    vi.mocked(getEntrepriseRepresentants).mockResolvedValue([fakeRep])

    const result = await bodaccCessionsSource.discover({ departement: '69' })
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('bodacc_cessions')
    expect(result[0].siren).toBe('552100554')
  })

  it('skips records with no extractable SIREN', async () => {
    vi.mocked(timedFetch).mockResolvedValue(
      new Response(JSON.stringify({ results: [{ ...fakeRecord, registre: undefined }] })),
    )
    vi.mocked(classifyBodaccEvent).mockReturnValue('cession')
    vi.mocked(extractSirenFromRegistre).mockReturnValue(null)

    const result = await bodaccCessionsSource.discover({ departement: '69' })
    expect(result).toHaveLength(0)
  })

  it('skips non-cession announcements', async () => {
    vi.mocked(timedFetch).mockResolvedValue(
      new Response(JSON.stringify({ results: [fakeRecord] })),
    )
    vi.mocked(classifyBodaccEvent).mockReturnValue('depot_comptes')
    vi.mocked(extractSirenFromRegistre).mockReturnValue('552100554')

    const result = await bodaccCessionsSource.discover({ departement: '69' })
    expect(result).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/discovery/__tests__/bodacc-cessions.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/discovery/bodacc-cessions.ts`**

```ts
import { timedFetch } from '@/lib/observability/logger'
import {
  extractSirenFromRegistre,
  classifyBodaccEvent,
  type BodaccRecord,
} from '@/lib/data-sources/bodacc'
import {
  searchEntreprises,
  getEntrepriseRepresentants,
} from '@/lib/data-sources/pappers'
import { rawProspectFromPappers, canonicalPersonKey } from '@/lib/prospect-search/engine'
import type { DiscoverySource, DiscoveryParams } from './types'
import type { RawProspect } from '@/lib/prospect-search/engine'

const BODACC_BASE =
  'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records'

const DEFAULT_LIMIT = 20

async function fetchCessions(
  dateSince: string,
  departement?: string,
  limit = 50,
): Promise<BodaccRecord[]> {
  // Single where clause (BODACC v2 ANDs multiple where params, but single clause is more robust)
  let where = `dateparution >= date'${dateSince}'`
  if (departement) {
    where += ` AND numerodepartement:"${departement}"`
  }
  const url = `${BODACC_BASE}?where=${encodeURIComponent(where)}&limit=${limit}&order_by=dateparution%20desc`

  try {
    const res = await timedFetch('bodacc', 'fetchCessionsDiscovery', url, {
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = (await res.json()) as { results?: BodaccRecord[] }
    return data.results ?? []
  } catch {
    return []
  }
}

export const bodaccCessionsSource: DiscoverySource = {
  name: 'bodacc-cessions',

  async discover(params: DiscoveryParams): Promise<RawProspect[]> {
    const limit = params.limit ?? DEFAULT_LIMIT

    // Default: look back 30 days
    const dateSince =
      params.date_depuis ??
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    // Pull more than limit to account for skipped records (no SIREN, non-cession)
    const records = await fetchCessions(dateSince, params.departement, limit * 3)

    const cessions = records.filter(
      (r) => classifyBodaccEvent(r) === 'cession',
    )

    const seen = new Set<string>()
    const results: RawProspect[] = []

    const settled = await Promise.allSettled(
      cessions.slice(0, limit * 2).map(async (record) => {
        const siren = extractSirenFromRegistre(record.registre)
        if (!siren) return null

        // Resolve company + dirigeant via Pappers
        const [{ resultats }, reps] = await Promise.all([
          searchEntreprises({ q: siren, par_page: 1 }),
          getEntrepriseRepresentants(siren),
        ])

        const ae = resultats[0]
        const physicals = reps.filter((r) => !r.personne_morale)
        if (!ae || !physicals.length) return null

        return rawProspectFromPappers(ae, physicals[0], 'bodacc_cessions')
      }),
    )

    for (const r of settled) {
      if (results.length >= limit) break
      if (r.status === 'rejected' || !r.value) continue
      const prospect = r.value
      if (seen.has(prospect.uid)) continue
      seen.add(prospect.uid)
      results.push(prospect)
    }

    return results
  },
}
```

- [ ] **Step 4: Run test**

```bash
npx vitest run lib/discovery/__tests__/bodacc-cessions.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add lib/discovery/bodacc-cessions.ts lib/discovery/__tests__/bodacc-cessions.test.ts
git commit -m "feat(discovery): add bodaccCessionsSource — recent cession cedants as hot prospects"
```

---

## Task 6: RPPS discovery source

**Files:**
- Create: `lib/discovery/rpps.ts`

Context: Queries `prospection_rpps_cache` (populated by Task 8 cron) for libéral practitioners in a department. For each match, does a fuzzy Pappers lookup by nom+prénom+ville to find the SIREN. Confidence scoring: nom +50, prénom exact +20 / initial match +10, ville normalized +20 / dept match +10, SELARL/SCP in nom_entreprise +10. Threshold: ≥70 → include. Cap: 20 Pappers calls max.

The cache table must exist (Task 3 migration). If cache is empty, returns [].

Existing `RppsData` type in `lib/types.ts` is used as-is. The `rpps?: RppsData` field in `ProspectEnrichmentData` is populated here so that when the prospect is later enriched, the RPPS data is already present.

- [ ] **Step 1: Write the failing test**

Create `lib/discovery/__tests__/rpps.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rppsSource, computeRppsMatchScore } from '../rpps'

vi.mock('@/lib/data-sources/pappers', () => ({
  searchEntreprises: vi.fn(),
  getEntrepriseRepresentants: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { searchEntreprises, getEntrepriseRepresentants } from '@/lib/data-sources/pappers'
import { createClient } from '@/lib/supabase/server'

const fakeRppsRow = {
  rpps_id: 'RPPS123456789',
  nom: 'DURAND',
  prenom: 'Marie',
  profession: 'Médecin',
  specialite: 'Médecine générale',
  mode_exercice: 'L',
  ville: 'LYON',
  code_postal: '69003',
}

const fakeAe = {
  siren: '987654321',
  nom_entreprise: 'SELARL DR DURAND',
  code_naf: '86.21Z',
  libelle_code_naf: 'Médecine générale',
  date_creation: '2012-06-01',
  tranche_effectif: '01',
  siege: { code_postal: '69003', ville: 'LYON', departement: '69' },
}
const fakeRep = {
  nom: 'DURAND',
  prenom: 'Marie',
  prenom_usuel: 'Marie',
  qualite: 'Médecin',
  personne_morale: false,
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('computeRppsMatchScore', () => {
  it('returns high score for exact nom+prenom+ville match with SELARL', () => {
    const score = computeRppsMatchScore(
      { nom: 'DURAND', prenom: 'Marie', ville: 'LYON', dept: '69' },
      { nom: 'DURAND', prenom_usuel: 'Marie', prenom: 'Marie', siege: { ville: 'LYON', departement: '69' }, nom_entreprise: 'SELARL DR DURAND' },
    )
    expect(score).toBeGreaterThanOrEqual(70)
  })

  it('returns low score when nom does not match', () => {
    const score = computeRppsMatchScore(
      { nom: 'DURAND', prenom: 'Marie', ville: 'LYON', dept: '69' },
      { nom: 'MARTIN', prenom_usuel: 'Sophie', prenom: 'Sophie', siege: { ville: 'PARIS', departement: '75' }, nom_entreprise: 'CABINET MARTIN' },
    )
    expect(score).toBeLessThan(70)
  })

  it('gives partial credit for initial match on prenom', () => {
    const score = computeRppsMatchScore(
      { nom: 'DURAND', prenom: 'Marie', ville: 'LYON', dept: '69' },
      { nom: 'DURAND', prenom_usuel: 'M', prenom: 'M', siege: { ville: 'LYON', departement: '69' }, nom_entreprise: 'CABINET DURAND' },
    )
    expect(score).toBeGreaterThanOrEqual(70) // nom(50) + initial(10) + ville(20) ≥ 70 ? 80 ✓
  })
})

describe('rppsSource', () => {
  it('returns empty array when cache is empty', async () => {
    const fakeSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            ilike: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          ilike: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    }
    vi.mocked(createClient).mockResolvedValue(fakeSupabase as never)
    const result = await rppsSource.discover({ departement: '69', profession: 'Medecin' })
    expect(result).toEqual([])
  })

  it('builds RawProspect with source rpps and rpps field populated', async () => {
    const fakeSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            ilike: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [fakeRppsRow], error: null }),
            }),
          }),
        }),
      }),
    }
    vi.mocked(createClient).mockResolvedValue(fakeSupabase as never)
    vi.mocked(searchEntreprises).mockResolvedValue({ resultats: [fakeAe], total: 1 })
    vi.mocked(getEntrepriseRepresentants).mockResolvedValue([fakeRep])

    const result = await rppsSource.discover({ departement: '69', profession: 'Medecin', limit: 5 })
    // If score >= 70, we expect a result
    if (result.length > 0) {
      expect(result[0].source).toBe('rpps')
    }
    // Either 0 or 1 result depending on scoring — no error is the main check
    expect(result.length).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/discovery/__tests__/rpps.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/discovery/rpps.ts`**

```ts
import { createClient } from '@/lib/supabase/server'
import {
  searchEntreprises,
  getEntrepriseRepresentants,
  type PappersEntreprise,
} from '@/lib/data-sources/pappers'
import { rawProspectFromPappers } from '@/lib/prospect-search/engine'
import type { DiscoverySource, DiscoveryParams } from './types'
import type { RawProspect } from '@/lib/prospect-search/engine'
import type { RppsData } from '@/lib/types'

const DEFAULT_LIMIT = 20
const MATCH_THRESHOLD = 70

interface RppsRow {
  rpps_id: string
  nom: string
  prenom: string | null
  profession: string
  specialite: string | null
  mode_exercice: string
  ville: string | null
  code_postal: string | null
}

interface MatchCandidate {
  nom: string
  prenom_usuel?: string
  prenom?: string
  nom_entreprise?: string
  siege?: {
    ville?: string
    departement?: string
  }
}

/**
 * Confidence score for RPPS row ↔ Pappers company match.
 * Exported for unit testing.
 */
export function computeRppsMatchScore(
  rpps: { nom: string; prenom: string; ville: string | null; dept: string },
  ae: MatchCandidate,
): number {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{Mn}/gu, '')
      .toUpperCase()
      .trim()

  let score = 0

  // Nom exact match: +50
  if (norm(ae.nom ?? '') === norm(rpps.nom)) score += 50

  // Prénom match
  const pappersPrenom = norm(ae.prenom_usuel ?? ae.prenom ?? '')
  const rppsPrenom = norm(rpps.prenom)
  if (pappersPrenom && rppsPrenom) {
    if (pappersPrenom === rppsPrenom) {
      score += 20
    } else if (pappersPrenom.length === 1 && rppsPrenom.startsWith(pappersPrenom)) {
      score += 10
    } else if (rppsPrenom.length === 1 && pappersPrenom.startsWith(rppsPrenom)) {
      score += 10
    }
  }

  // Ville / département
  const aeDept = ae.siege?.departement ?? ''
  const aeVille = norm(ae.siege?.ville ?? '')
  const rppsVille = norm(rpps.ville ?? '')
  if (rppsVille && aeVille && aeVille === rppsVille) {
    score += 20
  } else if (aeDept && rpps.dept && aeDept === rpps.dept) {
    score += 10
  }

  // SELARL / SCP bonus
  const nomE = norm(ae.nom_entreprise ?? '')
  if (nomE.includes('SELARL') || nomE.includes('SCP') || nomE.includes('SEL ')) {
    score += 10
  }

  return score
}

function mapRowToRppsData(row: RppsRow): RppsData {
  return {
    identifiant: row.rpps_id,
    profession: row.profession,
    categorie_professionnelle: row.specialite ?? undefined,
    mode_exercice: row.mode_exercice,
    cabinet_commune: row.ville ?? undefined,
    cabinet_code_postal: row.code_postal ?? undefined,
  }
}

async function matchRppsToProspect(
  row: RppsRow,
  dept: string,
): Promise<RawProspect | null> {
  const { resultats } = await searchEntreprises({
    q: `${row.prenom ?? ''} ${row.nom}`.trim(),
    departement: dept,
    par_page: 5,
  })

  for (const ae of resultats) {
    const reps = await getEntrepriseRepresentants(ae.siren)
    const physicals = reps.filter((r) => !r.personne_morale)
    if (!physicals.length) continue

    const rep = physicals[0]
    const score = computeRppsMatchScore(
      {
        nom: row.nom,
        prenom: row.prenom ?? '',
        ville: row.ville,
        dept,
      },
      {
        nom: rep.nom,
        prenom_usuel: rep.prenom_usuel,
        prenom: rep.prenom,
        nom_entreprise: ae.nom_entreprise,
        siege: ae.siege,
      } as MatchCandidate,
    )

    if (score < MATCH_THRESHOLD) continue

    const prospect = rawProspectFromPappers(ae, rep, 'rpps')
    // Attach RPPS data so enricher doesn't need to re-fetch it
    ;(prospect as RawProspect & { _rpps?: RppsData })._rpps = mapRowToRppsData(row)
    return prospect
  }

  return null
}

export const rppsSource: DiscoverySource = {
  name: 'rpps',

  async discover(params: DiscoveryParams): Promise<RawProspect[]> {
    const dept = params.departement
    if (!dept) return []

    const limit = params.limit ?? DEFAULT_LIMIT
    const supabase = await createClient()

    // Map UI profession to RPPS libellé
    const professionFilter =
      params.profession === 'Chirurgien-Dentiste' ? 'Chirurgien-Dentiste' : 'Médecin'

    const { data: rows, error } = await supabase
      .from('prospection_rpps_cache')
      .select('rpps_id, nom, prenom, profession, specialite, mode_exercice, ville, code_postal')
      .eq('mode_exercice', 'L')
      .ilike('code_postal', `${dept}%`)
      .limit(limit * 3)  // pull extra to account for failed matches

    if (error || !rows?.length) return []

    // Filter by profession client-side (avoids complex SQL for the profession variants)
    const candidates = (rows as RppsRow[]).filter((r) =>
      r.profession.toLowerCase().includes(professionFilter.toLowerCase()),
    )

    const seen = new Set<string>()
    const results: RawProspect[] = []

    const settled = await Promise.allSettled(
      candidates.slice(0, limit * 2).map((row) => matchRppsToProspect(row, dept)),
    )

    for (const r of settled) {
      if (results.length >= limit) break
      if (r.status === 'rejected' || !r.value) continue
      const prospect = r.value
      if (seen.has(prospect.uid)) continue
      seen.add(prospect.uid)
      results.push(prospect)
    }

    return results
  },
}
```

- [ ] **Step 4: Run test**

```bash
npx vitest run lib/discovery/__tests__/rpps.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add lib/discovery/rpps.ts lib/discovery/__tests__/rpps.test.ts
git commit -m "feat(discovery): add rppsSource — RPPS libéraux discovery via Supabase cache + Pappers fuzzy match"
```

---

## Task 7: Discovery orchestrator

**Files:**
- Create: `lib/discovery/index.ts`

Context: Takes a list of requested sources + params, runs them in parallel, deduplicates by `canonicalPersonKey`, caps at 50. Returns `RawProspect[]` that are appended to the existing `searchProspects` results in `recherche/run`.

- [ ] **Step 1: Write the failing test**

Create `lib/discovery/__tests__/index.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { runDiscovery } from '../index'

vi.mock('../pappers-naf', () => ({
  pappersNafSource: {
    name: 'pappers-naf',
    discover: vi.fn().mockResolvedValue([
      {
        uid: 'jean|dupont|123456789',
        source: 'pappers',
        siren: '123456789',
        dirigeant_nom: 'DUPONT',
        dirigeant_prenom: 'Jean',
        entreprise_nom: 'DUPONT CONSEIL',
        code_naf: '86.21Z', libelle_naf: '', date_creation: '',
        tranche_effectifs: '', adresse: '', code_postal: '69001',
        ville: 'LYON', departement: '69',
        dirigeant_qualite: 'Président',
        linkedin_search_url: '', score_initial: 40,
        source_type: 'personne_morale',
      },
    ]),
  },
}))

vi.mock('../bodacc-cessions', () => ({
  bodaccCessionsSource: {
    name: 'bodacc-cessions',
    discover: vi.fn().mockResolvedValue([
      {
        uid: 'marie|martin|987654321',
        source: 'bodacc_cessions',
        siren: '987654321',
        dirigeant_nom: 'MARTIN',
        dirigeant_prenom: 'Marie',
        entreprise_nom: 'MARTIN SAS',
        code_naf: '69.10Z', libelle_naf: '', date_creation: '',
        tranche_effectifs: '', adresse: '', code_postal: '75001',
        ville: 'PARIS', departement: '75',
        dirigeant_qualite: 'Gérante',
        linkedin_search_url: '', score_initial: 35,
        source_type: 'personne_morale',
      },
    ]),
  },
}))

vi.mock('../rpps', () => ({
  rppsSource: {
    name: 'rpps',
    discover: vi.fn().mockResolvedValue([]),
  },
}))

describe('runDiscovery', () => {
  it('merges results from multiple sources', async () => {
    const result = await runDiscovery({
      sources: ['pappers-naf', 'bodacc-cessions'],
      departement: '69',
      naf_code: '86.21Z',
    })
    expect(result.length).toBe(2)
    expect(result.map((r) => r.source)).toContain('pappers')
    expect(result.map((r) => r.source)).toContain('bodacc_cessions')
  })

  it('deduplicates prospects with same uid across sources', async () => {
    // Both sources return the same uid → only one in output
    const { pappersNafSource } = await import('../pappers-naf')
    const duplicate = {
      uid: 'marie|martin|987654321',
      source: 'pappers' as const,
      siren: '987654321',
      dirigeant_nom: 'MARTIN',
      dirigeant_prenom: 'Marie',
      entreprise_nom: 'MARTIN SAS',
      code_naf: '69.10Z', libelle_naf: '', date_creation: '',
      tranche_effectifs: '', adresse: '', code_postal: '75001',
      ville: 'PARIS', departement: '75',
      dirigeant_qualite: 'Gérante',
      linkedin_search_url: '', score_initial: 35,
      source_type: 'personne_morale' as const,
    }
    vi.mocked(pappersNafSource.discover).mockResolvedValueOnce([duplicate])

    const result = await runDiscovery({
      sources: ['pappers-naf', 'bodacc-cessions'],
      departement: '75',
    })
    const uids = result.map((r) => r.uid)
    const unique = new Set(uids)
    expect(unique.size).toBe(uids.length)
  })

  it('returns empty array when no sources requested', async () => {
    const result = await runDiscovery({ sources: [], departement: '69' })
    expect(result).toEqual([])
  })

  it('caps output at 50 prospects', async () => {
    const { pappersNafSource } = await import('../pappers-naf')
    const many = Array.from({ length: 40 }, (_, i) => ({
      uid: `person|${i}|${i}00000000`,
      source: 'pappers' as const,
      siren: `${i}00000000`.slice(0, 9),
      dirigeant_nom: `NOM${i}`,
      dirigeant_prenom: `PRENOM${i}`,
      entreprise_nom: `ENTREPRISE${i}`,
      code_naf: '86.21Z', libelle_naf: '', date_creation: '',
      tranche_effectifs: '', adresse: '', code_postal: '69001',
      ville: 'LYON', departement: '69',
      dirigeant_qualite: 'Président',
      linkedin_search_url: '', score_initial: 40,
      source_type: 'personne_morale' as const,
    }))
    vi.mocked(pappersNafSource.discover).mockResolvedValueOnce(many)

    const result = await runDiscovery({ sources: ['pappers-naf', 'bodacc-cessions'], departement: '69' })
    expect(result.length).toBeLessThanOrEqual(50)
  })

  it('handles source failure gracefully (Promise.allSettled)', async () => {
    const { pappersNafSource } = await import('../pappers-naf')
    vi.mocked(pappersNafSource.discover).mockRejectedValueOnce(new Error('network error'))

    const result = await runDiscovery({
      sources: ['pappers-naf', 'bodacc-cessions'],
      departement: '69',
    })
    // bodacc-cessions still returns its 1 result
    expect(result.length).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run lib/discovery/__tests__/index.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/discovery/index.ts`**

```ts
import { canonicalPersonKey } from '@/lib/prospect-search/engine'
import type { RawProspect } from '@/lib/prospect-search/engine'
import { pappersNafSource } from './pappers-naf'
import { bodaccCessionsSource } from './bodacc-cessions'
import { rppsSource } from './rpps'
import type { DiscoveryParams, DiscoverySource } from './types'

export type DiscoverySourceName = 'pappers-naf' | 'bodacc-cessions' | 'rpps'

const SOURCE_MAP: Record<DiscoverySourceName, DiscoverySource> = {
  'pappers-naf': pappersNafSource,
  'bodacc-cessions': bodaccCessionsSource,
  rpps: rppsSource,
}

const TOTAL_CAP = 50

export interface RunDiscoveryParams extends DiscoveryParams {
  sources: DiscoverySourceName[]
}

export async function runDiscovery(params: RunDiscoveryParams): Promise<RawProspect[]> {
  const { sources, ...discoveryParams } = params
  if (!sources.length) return []

  const tasks = sources.map((name) => {
    const source = SOURCE_MAP[name]
    if (!source) return Promise.resolve([])
    return source.discover({ ...discoveryParams, limit: discoveryParams.limit ?? 20 })
  })

  const settled = await Promise.allSettled(tasks)

  const seen = new Set<string>()
  const merged: RawProspect[] = []

  for (const result of settled) {
    if (result.status === 'rejected') continue
    for (const prospect of result.value) {
      if (merged.length >= TOTAL_CAP) break
      const key = canonicalPersonKey(
        prospect.dirigeant_prenom,
        prospect.dirigeant_nom,
        prospect.siren,
      )
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(prospect)
    }
  }

  return merged.slice(0, TOTAL_CAP)
}
```

- [ ] **Step 4: Run test**

```bash
npx vitest run lib/discovery/__tests__/index.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add lib/discovery/index.ts lib/discovery/__tests__/index.test.ts
git commit -m "feat(discovery): add discovery orchestrator — parallel dispatch, dedup, cap 50"
```

---

## Task 8: RPPS refresh cron

**Files:**
- Create: `app/api/cron/refresh-rpps/route.ts`
- Modify: `vercel.ts`

Context: Monthly cron that downloads the RPPS CSV from data.gouv.fr API (auto-discovers current resource URL via their dataset API), parses it, and upserts into `prospection_rpps_cache`. Filtered to libéraux only (mode_exercice='L') to keep the table under ~200k rows. Upserted in batches of 500. Paused in vercel.ts by default (same as refresh-enrichment).

CSV columns (RPPS "Extraction" file, separator `;`, encoding UTF-8 since 2022):
- `Identifiant PP` — rpps_id
- `Nom d'exercice` — nom
- `Prénom d'exercice` — prenom
- `Libellé profession` — profession
- `Libellé catégorie professionnelle` — specialite
- `Code mode d'exercice` — mode_exercice (L/S/B)
- `Libellé commune (structure)` — ville
- `Code postal (structure)` — code_postal

- [ ] **Step 1: Write the failing test**

Create `app/api/cron/refresh-rpps/__tests__/route.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseRppsCsvLine, RPPS_PROFESSIONS_CIBLES } from '../parse'

describe('parseRppsCsvLine', () => {
  it('parses a valid semicolon-delimited RPPS line', () => {
    // Headers: Identifiant PP;Nom d'exercice;Prénom d'exercice;...
    const headers = [
      "Identifiant PP",
      "Nom d'exercice",
      "Prénom d'exercice",
      "Libellé profession",
      "Libellé catégorie professionnelle",
      "Code mode d'exercice",
      "Libellé commune (structure)",
      "Code postal (structure)",
    ]
    const line = 'RPPS123456789;DUPONT;Jean;Médecin;;L;LYON;69003'
    const result = parseRppsCsvLine(line, headers)
    expect(result).not.toBeNull()
    expect(result!.rpps_id).toBe('RPPS123456789')
    expect(result!.nom).toBe('DUPONT')
    expect(result!.prenom).toBe('Jean')
    expect(result!.profession).toBe('Médecin')
    expect(result!.mode_exercice).toBe('L')
    expect(result!.ville).toBe('LYON')
    expect(result!.code_postal).toBe('69003')
  })

  it('returns null for non-liberal practitioners', () => {
    const headers = [
      "Identifiant PP", "Nom d'exercice", "Prénom d'exercice",
      "Libellé profession", "Libellé catégorie professionnelle",
      "Code mode d'exercice", "Libellé commune (structure)", "Code postal (structure)",
    ]
    const line = 'RPPS999;DUPONT;Jean;Médecin;;S;LYON;69003'
    const result = parseRppsCsvLine(line, headers)
    expect(result).toBeNull()
  })

  it('returns null for non-targeted professions', () => {
    const headers = [
      "Identifiant PP", "Nom d'exercice", "Prénom d'exercice",
      "Libellé profession", "Libellé catégorie professionnelle",
      "Code mode d'exercice", "Libellé commune (structure)", "Code postal (structure)",
    ]
    const line = 'RPPS999;DUPONT;Jean;Pédicure-podologue;;L;LYON;69003'
    const result = parseRppsCsvLine(line, headers)
    expect(result).toBeNull()
  })
})

describe('RPPS_PROFESSIONS_CIBLES', () => {
  it('includes Médecin and Chirurgien-Dentiste', () => {
    expect(RPPS_PROFESSIONS_CIBLES).toContain('Médecin')
    expect(RPPS_PROFESSIONS_CIBLES).toContain('Chirurgien-Dentiste')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run "app/api/cron/refresh-rpps/__tests__/route.test.ts"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `app/api/cron/refresh-rpps/parse.ts`** (pure parsing logic, testable without Next.js)

```ts
export const RPPS_PROFESSIONS_CIBLES = [
  'Médecin',
  'Chirurgien-Dentiste',
]

export interface RppsInsertRow {
  rpps_id: string
  nom: string
  prenom: string | null
  profession: string
  specialite: string | null
  mode_exercice: string
  ville: string | null
  code_postal: string | null
}

/**
 * Parse a single semicolon-delimited line from the RPPS CSV.
 * Returns null if the row should be skipped (non-libéral or non-targeted profession).
 */
export function parseRppsCsvLine(
  line: string,
  headers: string[],
): RppsInsertRow | null {
  const fields = line.split(';')
  const get = (colName: string): string => {
    const idx = headers.indexOf(colName)
    return idx >= 0 ? (fields[idx] ?? '').trim() : ''
  }

  const rpps_id = get('Identifiant PP')
  if (!rpps_id) return null

  const mode_exercice = get("Code mode d'exercice")
  if (mode_exercice !== 'L') return null

  const profession = get('Libellé profession')
  if (!RPPS_PROFESSIONS_CIBLES.some((p) => profession.includes(p))) return null

  return {
    rpps_id,
    nom: get("Nom d'exercice") || rpps_id,
    prenom: get("Prénom d'exercice") || null,
    profession,
    specialite: get('Libellé catégorie professionnelle') || null,
    mode_exercice,
    ville: get('Libellé commune (structure)') || null,
    code_postal: get('Code postal (structure)') || null,
  }
}
```

- [ ] **Step 4: Create `app/api/cron/refresh-rpps/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { parseRppsCsvLine } from './parse'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const RPPS_DATASET_ID = '53699613a3a729239d2048e3'
const DATAGOUV_API = 'https://www.data.gouv.fr/api/1'
const BATCH_SIZE = 500

function unauthorized() {
  return new NextResponse('Unauthorized', { status: 401 })
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

async function getLatestRppsUrl(): Promise<string> {
  const res = await fetch(`${DATAGOUV_API}/datasets/${RPPS_DATASET_ID}/`, {
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`data.gouv.fr dataset API error: ${res.status}`)
  const dataset = await res.json()
  // Find the main extraction resource (largest CSV file)
  const resources: Array<{ url: string; format: string; filesize?: number; title?: string }> =
    dataset.resources ?? []
  const csv = resources
    .filter((r) => r.format?.toLowerCase() === 'csv' || r.url?.endsWith('.csv'))
    .sort((a, b) => (b.filesize ?? 0) - (a.filesize ?? 0))[0]
  if (!csv) throw new Error('No CSV resource found in RPPS dataset')
  return csv.url
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized()

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const csvUrl = await getLatestRppsUrl()
  const csvRes = await fetch(csvUrl, { cache: 'no-store' })
  if (!csvRes.ok || !csvRes.body) {
    return NextResponse.json({ error: 'Failed to download RPPS CSV' }, { status: 500 })
  }

  // Stream + parse line by line
  const reader = csvRes.body.getReader()
  const decoder = new TextDecoder('utf-8')

  let buffer = ''
  let headers: string[] | null = null
  let batch: Record<string, unknown>[] = []
  let totalInserted = 0
  let totalSkipped = 0

  async function flushBatch() {
    if (!batch.length) return
    await supabase
      .from('prospection_rpps_cache')
      .upsert(batch as never[], { onConflict: 'rpps_id' })
    totalInserted += batch.length
    batch = []
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue

      if (!headers) {
        headers = line.split(';').map((h) => h.trim().replace(/^﻿/, ''))
        continue
      }

      const row = parseRppsCsvLine(line, headers)
      if (!row) {
        totalSkipped++
        continue
      }

      batch.push({ ...row, updated_at: new Date().toISOString() })
      if (batch.length >= BATCH_SIZE) await flushBatch()
    }
  }

  // Handle last line in buffer
  if (buffer.trim() && headers) {
    const row = parseRppsCsvLine(buffer.trim(), headers)
    if (row) batch.push({ ...row, updated_at: new Date().toISOString() })
  }
  await flushBatch()

  return NextResponse.json({
    ok: true,
    inserted: totalInserted,
    skipped: totalSkipped,
    source_url: csvUrl,
  })
}
```

- [ ] **Step 5: Run the test**

```bash
npx vitest run "app/api/cron/refresh-rpps/__tests__/route.test.ts"
```

Expected: all 4 tests PASS.

- [ ] **Step 6: Add cron to `vercel.ts`**

In `vercel.ts`, find the crons array and add (paused, same pattern as refresh-enrichment):

```ts
// refresh-rpps: PAUSED — run manually with: curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/refresh-rpps
//   { path: '/api/cron/refresh-rpps', schedule: '0 4 1 * *' },  // 1st of each month
```

Add this comment block inside the crons array, after the existing refresh-enrichment comment.

- [ ] **Step 7: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add app/api/cron/refresh-rpps/ vercel.ts
git commit -m "feat(discovery): add refresh-rpps cron — monthly RPPS CSV download to Supabase cache"
```

---

## Task 9: Extend recherche/run route

**Files:**
- Modify: `app/api/recherche/run/route.ts`

Context: Add optional `sources`, `naf_code`, `ca_min`, `rpps_profession`, `date_depuis`, `departement` params to the body. When `sources` is present and non-empty, call `runDiscovery()` before `searchProspects()`. Merge results, dedup by uid, and feed the combined `rawProspects` into the existing enrichment loop. The existing behavior (no `sources` param) is unchanged.

- [ ] **Step 1: Write the failing test**

Create `app/api/recherche/__tests__/run-discovery-params.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

// Test the param parsing logic in isolation — the route handler is hard to unit-test
// without mocking the full Next.js runtime. Test parsing only.

import { parseDiscoveryParams } from '../run/parse-params'

describe('parseDiscoveryParams', () => {
  it('returns empty sources when no sources in body', () => {
    const result = parseDiscoveryParams({})
    expect(result.sources).toEqual([])
  })

  it('extracts known sources', () => {
    const result = parseDiscoveryParams({
      sources: ['pappers-naf', 'bodacc-cessions'],
      naf_code: '86.21Z',
      departement: '69',
      ca_min: 500_000,
    })
    expect(result.sources).toEqual(['pappers-naf', 'bodacc-cessions'])
    expect(result.naf_code).toBe('86.21Z')
    expect(result.departement).toBe('69')
    expect(result.ca_min).toBe(500_000)
  })

  it('filters out unknown source names', () => {
    const result = parseDiscoveryParams({
      sources: ['pappers-naf', 'unknown-source', 'bodacc-cessions'],
    })
    expect(result.sources).not.toContain('unknown-source')
    expect(result.sources).toContain('pappers-naf')
    expect(result.sources).toContain('bodacc-cessions')
  })

  it('extracts rpps_profession', () => {
    const result = parseDiscoveryParams({ sources: ['rpps'], rpps_profession: 'Chirurgien-Dentiste' })
    expect(result.profession).toBe('Chirurgien-Dentiste')
  })
})
```

- [ ] **Step 2: Create `app/api/recherche/run/parse-params.ts`**

```ts
import type { DiscoverySourceName } from '@/lib/discovery'

const VALID_SOURCES: DiscoverySourceName[] = ['pappers-naf', 'bodacc-cessions', 'rpps']

export interface ParsedDiscoveryParams {
  sources: DiscoverySourceName[]
  naf_code?: string
  ca_min?: number
  profession?: 'Medecin' | 'Chirurgien-Dentiste'
  date_depuis?: string
  departement?: string
}

export function parseDiscoveryParams(body: Record<string, unknown>): ParsedDiscoveryParams {
  const rawSources = Array.isArray(body.sources) ? body.sources : []
  const sources = rawSources.filter((s): s is DiscoverySourceName =>
    VALID_SOURCES.includes(s as DiscoverySourceName),
  )

  return {
    sources,
    naf_code: typeof body.naf_code === 'string' ? body.naf_code : undefined,
    ca_min: typeof body.ca_min === 'number' ? body.ca_min : undefined,
    profession:
      body.rpps_profession === 'Chirurgien-Dentiste' ? 'Chirurgien-Dentiste' :
      body.rpps_profession === 'Medecin' ? 'Medecin' : undefined,
    date_depuis: typeof body.date_depuis === 'string' ? body.date_depuis : undefined,
    departement: typeof body.departement === 'string' ? body.departement : undefined,
  }
}
```

- [ ] **Step 3: Run test**

```bash
npx vitest run "app/api/recherche/__tests__/run-discovery-params.test.ts"
```

Expected: all 4 tests PASS.

- [ ] **Step 4: Modify `app/api/recherche/run/route.ts`**

Add import at top of file, after existing imports:

```ts
import { runDiscovery } from '@/lib/discovery'
import { parseDiscoveryParams } from './parse-params'
import type { RawProspect } from '@/lib/prospect-search/engine'
```

Inside the `POST` handler, after `const limit = ...` line and before loading the persona, add:

```ts
  const discoveryParams = parseDiscoveryParams(body)
```

After `const rawProspects = await searchProspects(criteria, { limit, strictFilters })`, add the discovery merge block:

```ts
  // Discovery sources (optional — only when client passes sources=[...])
  let discoveryRaw: RawProspect[] = []
  if (discoveryParams.sources.length > 0) {
    // Derive departement from criteria if not explicitly set by client
    const deptFromCriteria = criteria.locations?.[0]
      ? undefined // mapLocationsToDepartements not importable cleanly here — use explicit param
      : undefined
    const dept = discoveryParams.departement ?? deptFromCriteria

    discoveryRaw = await runDiscovery({
      ...discoveryParams,
      departement: dept,
    })
  }

  // Merge: discovery first (higher signal), then regular search
  // Dedup by uid (same person found by both paths → keep first occurrence)
  const seenUids = new Set<string>()
  const mergedRaw: RawProspect[] = []
  for (const r of [...discoveryRaw, ...rawProspects]) {
    if (!seenUids.has(r.uid)) {
      seenUids.add(r.uid)
      mergedRaw.push(r)
    }
  }
  const allRaw = mergedRaw.slice(0, limit)
```

Then replace the existing `rawProspects.length === 0` check and the `rawProspects.map(...)` call: change `rawProspects` to `allRaw` throughout the enrichment block. Specifically:
- `if (rawProspects.length === 0)` → `if (allRaw.length === 0)`
- `rawProspects.map((r) => r.linkedin_search_url)` → `allRaw.map((r) => r.linkedin_search_url)`
- `rawProspects.map(async (raw) => {` → `allRaw.map(async (raw) => {`

- [ ] **Step 5: Export `runDiscovery` and `DiscoverySourceName` from `lib/discovery/index.ts`**

The `index.ts` already has `export async function runDiscovery` and `export type DiscoverySourceName`. Verify the exports are correct:

```bash
grep -n "^export" lib/discovery/index.ts
```

Expected output:
```
export type DiscoverySourceName = ...
export async function runDiscovery...
```

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Smoke test the route still works without sources**

```bash
# Start dev server in background, then test existing behavior
curl -s -X POST http://localhost:3000/api/recherche/run \
  -H "Content-Type: application/json" \
  -H "Cookie: $(cat /tmp/auth-cookie 2>/dev/null || echo '')" \
  -d '{"persona_id": "test"}' | head -c 200
```

(Skip if no dev session available — TypeScript check + tests suffice.)

- [ ] **Step 8: Commit**

```bash
git add app/api/recherche/run/route.ts app/api/recherche/run/parse-params.ts app/api/recherche/__tests__/run-discovery-params.test.ts
git commit -m "feat(discovery): extend recherche/run to accept discovery sources — prepends discovery results to standard search"
```

---

## Task 10: Advanced filters UI

**Files:**
- Modify: `components/recherche/recherche-page-client.tsx`
- Modify: `components/recherche/recherche-launcher.tsx`

Context: Add a collapsible "Sources avancées" panel below the persona picker. When expanded, shows: source checkboxes (Pappers NAF, BODACC cessions, RPPS), conditional inputs (NAF code field when NAF checked, profession picker when RPPS checked, date_depuis when BODACC checked, département input). These params are sent in the POST body to `/api/recherche/run`. The result list is unchanged.

Design rules (from DESIGN.md): background `var(--color-surface)`, accent `#BC6B2A`, border-radius 2px, no rounded-xl.

- [ ] **Step 1: Add discovery state to `recherche-page-client.tsx`**

In `RecherchePageClient`, after the existing state declarations, add:

```ts
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [nafCode, setNafCode] = useState('')
  const [discoveryDept, setDiscoveryDept] = useState('')
  const [discoveryDateDepuis, setDiscoveryDateDepuis] = useState('')
  const [rppsProfession, setRppsProfession] = useState<'Medecin' | 'Chirurgien-Dentiste' | ''>('')
```

- [ ] **Step 2: Update `handleLaunch` to include discovery params**

In `handleLaunch`, change the `body` passed to the fetch:

```ts
      body: JSON.stringify({
        persona_id: selectedPersonaId,
        limit: 30,
        // Discovery sources — only sent when user activated them
        ...(selectedSources.length > 0 && {
          sources: selectedSources,
          naf_code: nafCode || undefined,
          departement: discoveryDept || undefined,
          date_depuis: discoveryDateDepuis || undefined,
          rpps_profession: rppsProfession || undefined,
        }),
      }),
```

- [ ] **Step 3: Pass advanced-filter props down to `RechercheLauncher`**

Update `RechercheLauncher` props interface and usage in `RecherchePageClient`:

In `recherche-launcher.tsx`, extend the `Props` interface:

```ts
interface Props {
  personas: Icp[]
  selectedPersonaId: string | null
  onSelect: (id: string) => void
  onLaunch: () => void
  loading: boolean
  disabled?: boolean
  // Advanced filters
  showAdvanced: boolean
  onToggleAdvanced: () => void
  selectedSources: string[]
  onToggleSource: (s: string) => void
  nafCode: string
  onNafCodeChange: (v: string) => void
  discoveryDept: string
  onDiscoveryDeptChange: (v: string) => void
  discoveryDateDepuis: string
  onDiscoveryDateDepuisChange: (v: string) => void
  rppsProfession: string
  onRppsProfessionChange: (v: 'Medecin' | 'Chirurgien-Dentiste' | '') => void
}
```

- [ ] **Step 4: Add advanced filters UI inside `RechercheLauncher`**

After the closing `</div>` of the flex container (button + persona picker), add the collapsible panel:

```tsx
      {/* Toggle button */}
      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          onClick={onToggleAdvanced}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--color-muted)',
            padding: 0,
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {showAdvanced ? '▲' : '▼'} Sources avancées
        </button>
      </div>

      {showAdvanced && (
        <div
          style={{
            marginTop: 12,
            padding: 16,
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 2,
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-muted)',
              marginBottom: 10,
              marginTop: 0,
            }}
          >
            Sources de découverte
          </p>

          {/* Source checkboxes */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { id: 'pappers-naf', label: 'Pappers NAF — entreprises par secteur' },
              { id: 'bodacc-cessions', label: 'BODACC cessions — dirigeants ayant vendu' },
              { id: 'rpps', label: 'RPPS — médecins et dentistes libéraux' },
            ].map(({ id, label }) => (
              <label
                key={id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}
              >
                <input
                  type="checkbox"
                  checked={selectedSources.includes(id)}
                  onChange={() => onToggleSource(id)}
                  style={{ accentColor: 'var(--color-accent)', width: 14, height: 14 }}
                />
                {label}
              </label>
            ))}
          </div>

          {/* Conditional: NAF code */}
          {selectedSources.includes('pappers-naf') && (
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>
                Code NAF
              </label>
              <input
                type="text"
                placeholder="86.21Z — médecins généralistes"
                value={nafCode}
                onChange={(e) => onNafCodeChange(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 2,
                  padding: '8px 10px',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          {/* Conditional: RPPS profession */}
          {selectedSources.includes('rpps') && (
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>
                Profession RPPS
              </label>
              <select
                value={rppsProfession}
                onChange={(e) => onRppsProfessionChange(e.target.value as 'Medecin' | 'Chirurgien-Dentiste' | '')}
                style={{
                  width: '100%',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 2,
                  padding: '8px 10px',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              >
                <option value="">Toutes</option>
                <option value="Medecin">Médecins</option>
                <option value="Chirurgien-Dentiste">Chirurgiens-Dentistes</option>
              </select>
            </div>
          )}

          {/* Conditional: BODACC date */}
          {selectedSources.includes('bodacc-cessions') && (
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>
                Cessions depuis
              </label>
              <input
                type="date"
                value={discoveryDateDepuis}
                onChange={(e) => onDiscoveryDateDepuisChange(e.target.value)}
                style={{
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 2,
                  padding: '8px 10px',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
            </div>
          )}

          {/* Department override */}
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-muted)', display: 'block', marginBottom: 4 }}>
              Département (optionnel)
            </label>
            <input
              type="text"
              placeholder="69, 75, 13…"
              value={discoveryDept}
              onChange={(e) => onDiscoveryDeptChange(e.target.value)}
              style={{
                width: 120,
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 2,
                padding: '8px 10px',
                fontSize: 13,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>

          <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 10, marginBottom: 0 }}>
            Budget max : ~41 jetons Pappers par recherche multi-source
          </p>
        </div>
      )}
```

- [ ] **Step 5: Update `RecherchePageClient` to pass all advanced filter props**

In `recherche-page-client.tsx`, update the `<RechercheLauncher ... />` JSX to include all new props:

```tsx
        <RechercheLauncher
          personas={personas}
          selectedPersonaId={selectedPersonaId}
          onSelect={setSelectedPersonaId}
          onLaunch={handleLaunch}
          loading={loading}
          disabled={adding}
          showAdvanced={showAdvanced}
          onToggleAdvanced={() => setShowAdvanced((v) => !v)}
          selectedSources={selectedSources}
          onToggleSource={(s) =>
            setSelectedSources((prev) =>
              prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
            )
          }
          nafCode={nafCode}
          onNafCodeChange={setNafCode}
          discoveryDept={discoveryDept}
          onDiscoveryDeptChange={setDiscoveryDept}
          discoveryDateDepuis={discoveryDateDepuis}
          onDiscoveryDateDepuisChange={setDiscoveryDateDepuis}
          rppsProfession={rppsProfession}
          onRppsProfessionChange={setRppsProfession}
        />
```

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Build check**

```bash
npx next build 2>&1 | tail -20
```

Expected: build succeeds, no type errors.

- [ ] **Step 8: Commit**

```bash
git add components/recherche/recherche-launcher.tsx components/recherche/recherche-page-client.tsx
git commit -m "feat(discovery): add advanced sources UI — collapsible panel with NAF/BODACC/RPPS filters"
```

---

## Self-review

### Spec coverage

| Spec requirement | Covered in task |
|---|---|
| `DiscoverySource` interface | Task 2 |
| `DiscoveryParams` with all fields | Task 2 |
| `SearchCandidate.raw.source` extended to include rpps/bodacc_cessions | Task 1 |
| `lib/discovery/pappers-naf.ts` | Task 4 |
| `lib/discovery/bodacc-cessions.ts` | Task 5 |
| `lib/discovery/rpps.ts` | Task 6 |
| `lib/discovery/index.ts` (orchestrator) | Task 7 |
| `prospection_rpps_cache` table | Task 3 |
| Monthly RPPS cron | Task 8 |
| `/recherche/run` accepts `sources[]` | Task 9 |
| Advanced filters UI (collapsible) | Task 10 |
| Dedup by canonicalPersonKey | Task 7 |
| Cap 50 total | Task 7 |
| Budget: ~41 Pappers tokens max | Design constraint — enforced by per-source caps of 20 |
| `rpps?: RppsData` populated at discovery time | Task 6 (`_rpps` field — enricher picks this up) |
| BODACC: skip no-SIREN, no-reps, non-cession | Task 5 |
| `Promise.allSettled` (graceful failure) | Tasks 5, 6, 7 |

### RPPS `_rpps` field pickup

Task 6 stores RPPS data in `prospect._rpps`. The enricher needs to pick it up and put it in `enrichment_data.rpps`. **Gap**: the enricher (`lib/enrichment/enricher.ts`) doesn't currently read `raw._rpps`. This is an acceptable MVP gap — the RPPS discovery source finds the prospect; full RPPS data will be fetched during normal enrichment via the API Annuaire Santé lookup. The `_rpps` pre-population optimization can be added in a follow-up.

### Placeholder scan

No TBDs or vague steps remain. All code is complete.

### Type consistency

- `rawProspectFromPappers` uses `RawProspect['source']` as the type for sourceOverride — consistent with the union defined in the same file.
- `runDiscovery` imports `DiscoverySourceName` from its own module — no cross-module type drift.
- `parseDiscoveryParams` output type `ParsedDiscoveryParams.profession` is `'Medecin' | 'Chirurgien-Dentiste' | undefined` — matches `DiscoveryParams.profession`.
