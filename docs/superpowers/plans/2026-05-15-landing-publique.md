# Landing publique commerciale `/` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer `/` en landing publique commerciale qui convertit les visiteurs anonymes via une démo (champ libre → animation → 4 cartes floutées → paywall signup), tout en redirigeant directement les users connectés vers `/suivi`.

**Architecture:** Côté serveur, `app/page.tsx` branche sur l'état d'auth — connecté → redirect `/suivi`, anonyme → render `<LandingPublic />` (composant orchestrateur client). La landing est une state machine à 3 phases (`idle | parsing | reveal`) qui réutilise l'overlay de chargement existant et débouche sur des cartes prospect floutées générées à partir d'un hash déterministe de la query (zéro appel Claude/DB). Au paywall, la description est stockée en `sessionStorage` puis consommée post-signin (signup ou login) pour créer la persona automatiquement et rediriger vers `/recherche`.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase SSR auth, Tailwind 4 + CSS variables (DESIGN.md), Vitest + happy-dom pour les tests unitaires des helpers `lib/`.

**Branche de travail :** Tout commit direct sur `intelligence` (pas de feature branch).

**Spec source :** `docs/superpowers/specs/2026-05-15-landing-publique-design.md`

---

## File Structure

**Nouveaux fichiers :**

| Path | Responsabilité |
|---|---|
| `lib/pending-description.ts` | Helper sessionStorage : `storePendingDescription`, `consumePendingDescription` |
| `lib/__tests__/pending-description.test.ts` | Tests unitaires du helper |
| `lib/preview-generator.ts` | Hash déterministe + génération de 4 cartes plausibles + compteur depuis une query |
| `lib/__tests__/preview-generator.test.ts` | Tests unitaires (déterminisme, plausibilité) |
| `components/landing/public-header.tsx` | Header public (logo + lien "Connexion") |
| `components/landing/landing-hero.tsx` | Hero adapté landing publique : titre, sous-titre, champ, suggestions, callback submit (pas de fetch direct) |
| `components/landing/use-cases-section.tsx` | 3 cartes cas d'usage cliquables qui pré-remplissent le hero |
| `components/landing/blurred-preview.tsx` | 4 cartes prospect floutées + paywall sticky bottom |
| `components/landing/loading-overlay.tsx` | Extrait `LoadingOverlay` de `hero-search.tsx` (réutilisé) |
| `components/landing/landing-public.tsx` | Orchestrateur : compose tout + state machine `idle → parsing → reveal` |

**Fichiers modifiés :**

| Path | Modification |
|---|---|
| `app/page.tsx` | Refactor logique routage : connecté → `/suivi`, anonyme → `<LandingPublic />` |
| `app/(auth)/signup/page.tsx` | Après `signInWithPassword`, consume pending description → POST `/api/personas` → redirect `/recherche?persona=<id>` |
| `app/(auth)/login/page.tsx` | Idem signup (même branche post-auth) |

**Fichiers supprimés :**

| Path | Raison |
|---|---|
| `components/search/hero-search.tsx` | Plus utilisé (seul appelant `app/page.tsx` est refactoré) |
| `components/search/` (dossier vide) | Cleanup |

---

## Task 1 : Helper `pending-description`

**Files:**
- Create: `lib/pending-description.ts`
- Test: `lib/__tests__/pending-description.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/pending-description.test.ts` :

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { storePendingDescription, consumePendingDescription } from '../pending-description'

describe('pending-description', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('stores then consumes the description (one-shot)', () => {
    storePendingDescription('Chirurgiens lyonnais')
    expect(consumePendingDescription()).toBe('Chirurgiens lyonnais')
    expect(consumePendingDescription()).toBeNull()
  })

  it('returns null when nothing stored', () => {
    expect(consumePendingDescription()).toBeNull()
  })

  it('overwrites previous value', () => {
    storePendingDescription('A')
    storePendingDescription('B')
    expect(consumePendingDescription()).toBe('B')
  })

  it('trims whitespace on store', () => {
    storePendingDescription('  hello  ')
    expect(consumePendingDescription()).toBe('hello')
  })

  it('ignores empty strings on store', () => {
    storePendingDescription('   ')
    expect(consumePendingDescription()).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pending-description`
Expected: FAIL with "Cannot find module '../pending-description'"

- [ ] **Step 3: Write minimal implementation**

Create `lib/pending-description.ts` :

```ts
const KEY = 'charlie_pending_desc'

export function storePendingDescription(desc: string): void {
  if (typeof window === 'undefined') return
  const trimmed = desc.trim()
  if (!trimmed) return
  sessionStorage.setItem(KEY, trimmed)
}

export function consumePendingDescription(): string | null {
  if (typeof window === 'undefined') return null
  const desc = sessionStorage.getItem(KEY)
  if (desc) sessionStorage.removeItem(KEY)
  return desc
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pending-description`
Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add lib/pending-description.ts lib/__tests__/pending-description.test.ts
git commit -m "feat(landing): add sessionStorage helper for pending description across signup"
```

---

## Task 2 : Générateur de preview floutée

**Files:**
- Create: `lib/preview-generator.ts`
- Test: `lib/__tests__/preview-generator.test.ts`

Génère, à partir d'une query, un compteur déterministe (50-249) et 4 cartes plausibles. Hash basé sur cyrb53 (rapide, distribution OK, pas de dep).

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/preview-generator.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { generatePreview, type PreviewCard } from '../preview-generator'

describe('preview-generator', () => {
  it('produces deterministic output for the same query', () => {
    const a = generatePreview('Chirurgiens lyonnais')
    const b = generatePreview('Chirurgiens lyonnais')
    expect(a.count).toBe(b.count)
    expect(a.cards).toEqual(b.cards)
  })

  it('produces different output for different queries', () => {
    const a = generatePreview('Chirurgiens lyonnais')
    const b = generatePreview('Vétérinaires Bordeaux')
    expect(a.count).not.toBe(b.count)
  })

  it('count is between 50 and 249', () => {
    for (const q of ['a', 'comptables', 'CEO engrais bio', 'x'.repeat(200)]) {
      const { count } = generatePreview(q)
      expect(count).toBeGreaterThanOrEqual(50)
      expect(count).toBeLessThanOrEqual(249)
    }
  })

  it('returns exactly 4 cards', () => {
    expect(generatePreview('comptables Gironde').cards).toHaveLength(4)
  })

  it('each card has score 65-95', () => {
    const { cards } = generatePreview('Vendeurs récents BODACC')
    for (const c of cards) {
      expect(c.score).toBeGreaterThanOrEqual(65)
      expect(c.score).toBeLessThanOrEqual(95)
    }
  })

  it('each card has city, naf, signals', () => {
    const { cards } = generatePreview('Dirigeants PME')
    for (const c of cards) {
      expect(typeof c.city).toBe('string')
      expect(c.city.length).toBeGreaterThan(0)
      expect(c.naf).toMatch(/^\d{4}[A-Z]$/)
      expect(Array.isArray(c.signals)).toBe(true)
      expect(c.signals.length).toBeGreaterThan(0)
    }
  })

  it('handles empty query gracefully', () => {
    const { count, cards } = generatePreview('')
    expect(count).toBeGreaterThanOrEqual(50)
    expect(cards).toHaveLength(4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- preview-generator`
Expected: FAIL with "Cannot find module '../preview-generator'"

- [ ] **Step 3: Write minimal implementation**

Create `lib/preview-generator.ts` :

```ts
export interface PreviewCard {
  score: number          // 65-95
  city: string           // ex: "Lyon 6e"
  naf: string            // ex: "8622A"
  signals: string[]      // ex: ["VENTE BODACC", "PATRIMOINE 4.2M€"]
}

export interface Preview {
  count: number          // 50-249
  cards: PreviewCard[]   // exactly 4
}

const CITIES = [
  'Lyon 6e', 'Bordeaux', 'Paris 16e', 'Marseille 8e', 'Toulouse',
  'Nantes', 'Strasbourg', 'Lille', 'Nice', 'Rennes',
  'Aix-en-Provence', 'Annecy', 'Versailles', 'La Rochelle', 'Biarritz',
]

const NAF_CODES = [
  '8622A', '8622B', '6920Z', '4719A', '4711F',
  '7022Z', '6831Z', '6201Z', '7112B', '8559A',
]

const SIGNAL_TEMPLATES = [
  (rng: () => number) => `PATRIMOINE ${(2 + rng() * 8).toFixed(1)}M€`,
  () => 'VENTE BODACC',
  () => 'CESSION RÉCENTE',
  (rng: () => number) => `${Math.floor(50 + rng() * 25)} ANS`,
  () => 'TRANSMISSION PRÉVUE',
  () => 'LIQUIDITÉS DISPO',
]

// cyrb53 — fast non-cryptographic hash, deterministic, well-distributed.
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

// Mulberry32 PRNG seeded by cyrb53 — deterministic, uniform.
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]
}

export function generatePreview(query: string): Preview {
  const seed = cyrb53(query || 'default')
  const rng = makeRng(seed)

  const count = 50 + Math.floor(rng() * 200) // 50-249

  const cards: PreviewCard[] = Array.from({ length: 4 }, () => {
    const score = 65 + Math.floor(rng() * 31) // 65-95
    const city = pick(CITIES, rng)
    const naf = pick(NAF_CODES, rng)

    // 2 signals per card, no duplicates
    const signalCount = 2
    const signals: string[] = []
    const usedTemplateIdx = new Set<number>()
    while (signals.length < signalCount) {
      const idx = Math.floor(rng() * SIGNAL_TEMPLATES.length)
      if (usedTemplateIdx.has(idx)) continue
      usedTemplateIdx.add(idx)
      signals.push(SIGNAL_TEMPLATES[idx](rng))
    }

    return { score, city, naf, signals }
  })

  return { count, cards }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- preview-generator`
Expected: PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add lib/preview-generator.ts lib/__tests__/preview-generator.test.ts
git commit -m "feat(landing): deterministic preview generator (4 fake cards + counter from query hash)"
```

---

## Task 3 : Composant `PublicHeader`

**Files:**
- Create: `components/landing/public-header.tsx`

- [ ] **Step 1: Create the component**

Create `components/landing/public-header.tsx` :

```tsx
import Link from 'next/link'

export function PublicHeader() {
  return (
    <header
      style={{
        padding: '18px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div
        className="font-display"
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--color-text)',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          letterSpacing: '-0.01em',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--color-accent)',
            flexShrink: 0,
          }}
        />
        Charlie
        <span
          style={{
            color: 'var(--color-muted)',
            fontWeight: 300,
            fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
          }}
        >
          ·
        </span>
        Prospection
      </div>

      <Link
        href="/login"
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--color-muted)',
          textDecoration: 'none',
          padding: '6px 10px',
          letterSpacing: '0.01em',
          transition: 'color 120ms',
        }}
        className="charlie-connexion-link"
      >
        Connexion
      </Link>
    </header>
  )
}
```

Note : pour le hover, on s'appuiera sur une classe + DESIGN.md global. Si une classe `charlie-connexion-link:hover` n'existe pas dans `globals.css`, on inline le hover via `onMouseEnter/Leave` plus bas. Pour cette première version, on assume qu'on peut ajouter une règle CSS minimale dans `app/globals.css` à la fin du fichier :

```css
.charlie-connexion-link:hover {
  color: var(--color-accent);
}
```

- [ ] **Step 2: Add hover style to globals.css**

Open `app/globals.css` and append:

```css
.charlie-connexion-link:hover {
  color: var(--color-accent);
}
```

- [ ] **Step 3: Commit**

```bash
git add components/landing/public-header.tsx app/globals.css
git commit -m "feat(landing): add PublicHeader component with Connexion link"
```

---

## Task 4 : Composant `LoadingOverlay` (extraction)

**Files:**
- Create: `components/landing/loading-overlay.tsx`

L'overlay actuel est défini dans `components/search/hero-search.tsx:340-428`. On l'extrait pour réutilisation.

- [ ] **Step 1: Create the component**

Create `components/landing/loading-overlay.tsx` :

```tsx
'use client'

interface Props {
  message: string
}

export function LoadingOverlay({ message }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(243, 239, 230, 0.92)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 32,
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: '100%',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderLeft: '2px solid var(--color-accent)',
          padding: '28px 32px',
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-accent)',
            marginBottom: 12,
          }}
        >
          Création de votre cible
        </p>
        <p
          className="font-display"
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--color-text)',
            letterSpacing: '-0.01em',
            lineHeight: 1.25,
            minHeight: 56,
          }}
          key={message}
        >
          {message}
        </p>
        <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 16, lineHeight: 1.5 }}>
          Quelques secondes. Vous pourrez ensuite ajuster les filtres à la main avant de lancer la recherche.
        </p>
        <div
          style={{
            marginTop: 16,
            height: 2,
            background: 'var(--color-border)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'var(--color-accent)',
              animation: 'charlie-progress 2.4s ease-in-out infinite',
              transformOrigin: 'left',
            }}
          />
        </div>
      </div>
      <style>{`
        @keyframes charlie-progress {
          0%   { transform: scaleX(0);   transform-origin: left;  }
          50%  { transform: scaleX(1);   transform-origin: left;  }
          50.01% { transform: scaleX(1); transform-origin: right; }
          100% { transform: scaleX(0);   transform-origin: right; }
        }
      `}</style>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/landing/loading-overlay.tsx
git commit -m "feat(landing): extract LoadingOverlay component for reuse"
```

---

## Task 5 : Composant `LandingHero`

**Files:**
- Create: `components/landing/landing-hero.tsx`

Hero adapté pour landing publique. Le submit est délégué via prop callback (le parent `LandingPublic` orchestre la state machine).

- [ ] **Step 1: Create the component**

Create `components/landing/landing-hero.tsx` :

```tsx
'use client'

import { forwardRef, useImperativeHandle, useRef } from 'react'

const SUGGESTIONS = [
  'Comptables en Gironde',
  'Ressources humaines PME',
  'CEO engrais bio',
  'Vétérinaires diplômés',
  'Responsables achats',
] as const

const PLACEHOLDER = 'Ex : Chirurgiens lyonnais proches de la retraite…'

interface Props {
  description: string
  onDescriptionChange: (value: string) => void
  onSubmit: () => void
  disabled: boolean
}

export interface LandingHeroHandle {
  focus: () => void
  scrollIntoView: () => void
}

export const LandingHero = forwardRef<LandingHeroHandle, Props>(function LandingHero(
  { description, onDescriptionChange, onSubmit, disabled },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null)
  const sectionRef = useRef<HTMLElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    scrollIntoView: () => sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
  }))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim() || disabled) return
    onSubmit()
  }

  return (
    <section
      ref={sectionRef}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px 80px',
        maxWidth: 660,
        margin: '0 auto',
        width: '100%',
        minHeight: '70vh',
      }}
    >
      <h1
        className="font-display"
        style={{
          fontSize: 'clamp(36px, 5.5vw, 52px)',
          fontWeight: 700,
          lineHeight: 1.08,
          letterSpacing: '-0.03em',
          textAlign: 'center',
          color: 'var(--color-text)',
          marginBottom: 14,
        }}
      >
        Qui cherchez-vous&nbsp;?
      </h1>
      <p
        style={{
          fontSize: 15,
          color: 'var(--color-muted)',
          textAlign: 'center',
          marginBottom: 32,
          lineHeight: 1.5,
        }}
      >
        Décrivez votre prospect idéal.
      </p>

      <form onSubmit={handleSubmit} style={{ width: '100%' }}>
        <div
          style={{
            display: 'flex',
            width: '100%',
            border: '1px solid var(--color-border)',
            borderRadius: 2,
            background: 'var(--color-surface)',
            overflow: 'hidden',
            transition: 'border-color 120ms',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-text)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
        >
          <input
            ref={inputRef}
            type="text"
            value={description}
            onChange={e => onDescriptionChange(e.target.value)}
            placeholder={PLACEHOLDER}
            aria-label="Décrivez votre prospect idéal"
            disabled={disabled}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontFamily: 'inherit',
              fontSize: 14,
              color: 'var(--color-text)',
              padding: '14px 16px',
              lineHeight: 1.4,
              minWidth: 0,
            }}
          />
          <button
            type="submit"
            disabled={disabled || !description.trim()}
            style={{
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 600,
              padding: '0 24px',
              background: 'var(--color-text)',
              color: 'var(--color-bg)',
              border: 'none',
              cursor: disabled || !description.trim() ? 'not-allowed' : 'pointer',
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              opacity: disabled || !description.trim() ? 0.5 : 1,
              transition: 'opacity 100ms',
            }}
          >
            Lancer la recherche
          </button>
        </div>
      </form>

      <div
        role="list"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          justifyContent: 'center',
          marginTop: 20,
        }}
      >
        {SUGGESTIONS.map(s => (
          <button
            key={s}
            role="listitem"
            type="button"
            disabled={disabled}
            onClick={() => onDescriptionChange(s)}
            style={{
              fontFamily: 'inherit',
              fontSize: 12.5,
              fontWeight: 500,
              padding: '6px 13px',
              border: '1px solid var(--color-border)',
              borderRadius: 2,
              background: 'transparent',
              color: 'var(--color-muted)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              lineHeight: 1.3,
              transition: 'all 100ms',
              opacity: disabled ? 0.5 : 1,
            }}
            onMouseEnter={e => {
              if (disabled) return
              e.currentTarget.style.borderColor = 'var(--color-accent)'
              e.currentTarget.style.color = 'var(--color-accent)'
              e.currentTarget.style.background = 'var(--color-accent-dim)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.color = 'var(--color-muted)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </section>
  )
})
```

- [ ] **Step 2: Commit**

```bash
git add components/landing/landing-hero.tsx
git commit -m "feat(landing): add LandingHero component (anonymous-only, callback-driven submit)"
```

---

## Task 6 : Composant `UseCasesSection`

**Files:**
- Create: `components/landing/use-cases-section.tsx`

3 cartes cliquables sous le pli. Click → pré-remplit le hero + scroll up.

- [ ] **Step 1: Create the component**

Create `components/landing/use-cases-section.tsx` :

```tsx
'use client'

interface UseCase {
  score: number
  title: string
  description: string
}

const USE_CASES: readonly UseCase[] = [
  {
    score: 87,
    title: 'Chirurgiens proches de la retraite',
    description: 'NAF santé, 55+ ans, Île-de-France',
  },
  {
    score: 73,
    title: 'Vendeurs récents BODACC',
    description: 'Cession de société, liquidités disponibles',
  },
  {
    score: 91,
    title: 'Dirigeants PME 50+ ans',
    description: 'NAF industrie, ETI familiales, transmission',
  },
] as const

interface Props {
  onPick: (description: string) => void
}

export function UseCasesSection({ onPick }: Props) {
  return (
    <section
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '64px 24px 96px',
        width: '100%',
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-accent)',
          marginBottom: 12,
          textAlign: 'center',
        }}
      >
        Exemples de cibles
      </p>
      <h2
        className="font-display"
        style={{
          fontSize: 'clamp(24px, 3vw, 32px)',
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
          color: 'var(--color-text)',
          textAlign: 'center',
          marginBottom: 40,
        }}
      >
        Quelques prospects que Charlie identifie aujourd'hui.
      </h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
        }}
      >
        {USE_CASES.map(uc => (
          <button
            key={uc.title}
            type="button"
            onClick={() => onPick(uc.title)}
            style={{
              textAlign: 'left',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderLeft: '2px solid var(--color-accent)',
              borderRadius: 2,
              padding: '20px 22px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background 120ms',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              minHeight: 168,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--color-accent-dim)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--color-surface)'
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono), ui-monospace, monospace',
                fontVariantNumeric: 'tabular-nums',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-accent)',
                letterSpacing: '0.02em',
              }}
            >
              SCORE {uc.score}
            </span>
            <h3
              className="font-display"
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: 'var(--color-text)',
                letterSpacing: '-0.01em',
                lineHeight: 1.25,
                margin: 0,
              }}
            >
              {uc.title}
            </h3>
            <p
              style={{
                fontSize: 13,
                color: 'var(--color-muted)',
                lineHeight: 1.5,
                margin: 0,
                flex: 1,
              }}
            >
              {uc.description}
            </p>
            <span
              style={{
                fontSize: 12,
                color: 'var(--color-accent)',
                fontWeight: 500,
                marginTop: 4,
              }}
            >
              Voir un exemple →
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/landing/use-cases-section.tsx
git commit -m "feat(landing): add 3 use case cards section (click pre-fills hero)"
```

---

## Task 7 : Composant `BlurredPreview` + paywall

**Files:**
- Create: `components/landing/blurred-preview.tsx`

Affiche les 4 cartes floutées + barre paywall sticky bottom. Le compteur et les cartes viennent du `generatePreview` (Task 2).

- [ ] **Step 1: Create the component**

Create `components/landing/blurred-preview.tsx` :

```tsx
'use client'

import type { Preview } from '@/lib/preview-generator'

interface Props {
  query: string
  preview: Preview
  onSignup: () => void
}

export function BlurredPreview({ query, preview, onSignup }: Props) {
  return (
    <div
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '24px 24px 140px', // bottom padding leaves room for sticky paywall
        width: '100%',
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-accent)',
          marginBottom: 8,
        }}
      >
        Recherche : « {query} »
      </p>
      <h2
        className="font-display"
        style={{
          fontSize: 'clamp(22px, 3vw, 28px)',
          fontWeight: 600,
          lineHeight: 1.2,
          letterSpacing: '-0.02em',
          color: 'var(--color-text)',
          marginBottom: 24,
        }}
      >
        Aperçu de vos prospects
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {preview.cards.map((card, i) => (
          <article
            key={i}
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderLeft: '2px solid var(--color-accent)',
              borderRadius: 2,
              padding: '16px 20px',
              display: 'grid',
              gridTemplateColumns: '64px 1fr',
              gap: 16,
              alignItems: 'start',
              opacity: 0,
              animation: `charlie-card-in 360ms ease-out ${i * 80}ms forwards`,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono), ui-monospace, monospace',
                fontVariantNumeric: 'tabular-nums',
                fontSize: 22,
                fontWeight: 700,
                color: 'var(--color-accent)',
                lineHeight: 1,
              }}
            >
              {card.score}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <div
                aria-hidden
                style={{
                  filter: 'blur(6px)',
                  userSelect: 'none',
                  fontFamily: 'var(--font-display), Fraunces, serif',
                  fontSize: 17,
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  letterSpacing: '-0.01em',
                  lineHeight: 1.2,
                }}
              >
                Nom Prénom Confidentiel
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                {card.city} · NAF {card.naf}
              </div>
              <div
                aria-hidden
                style={{
                  filter: 'blur(5px)',
                  userSelect: 'none',
                  fontSize: 12,
                  color: 'var(--color-muted)',
                  lineHeight: 1.4,
                }}
              >
                Société active depuis 2018, capital social, dirigeant principal, bilan disponible.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {card.signals.map(sig => (
                  <span
                    key={sig}
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      padding: '3px 7px',
                      border: '1px solid var(--color-accent)',
                      color: 'var(--color-accent)',
                      borderRadius: 2,
                      fontFamily: 'var(--font-mono), ui-monospace, monospace',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {sig}
                  </span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>

      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'var(--color-surface)',
          borderTop: '1px solid var(--color-border)',
          padding: '16px 24px',
          zIndex: 40,
          boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
            <p
              className="font-display"
              style={{
                fontSize: 17,
                fontWeight: 600,
                color: 'var(--color-text)',
                letterSpacing: '-0.01em',
                lineHeight: 1.3,
                margin: 0,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono), ui-monospace, monospace',
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--color-accent)',
                }}
              >
                {preview.count}
              </span>{' '}
              prospects identifiés.
            </p>
            <p style={{ fontSize: 13, color: 'var(--color-muted)', margin: '4px 0 0' }}>
              Créez votre compte pour les découvrir.
            </p>
          </div>
          <button
            type="button"
            onClick={onSignup}
            style={{
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 600,
              padding: '12px 22px',
              background: 'var(--color-text)',
              color: 'var(--color-bg)',
              border: 'none',
              borderRadius: 2,
              cursor: 'pointer',
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Commencer
          </button>
        </div>
      </div>

      <style>{`
        @keyframes charlie-card-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/landing/blurred-preview.tsx
git commit -m "feat(landing): add BlurredPreview (4 floutées + sticky paywall bottom)"
```

---

## Task 8 : Orchestrateur `LandingPublic`

**Files:**
- Create: `components/landing/landing-public.tsx`

Compose tout. State machine `idle → parsing → reveal`. Gère le timer animation, le scroll-up sur pick-from-use-case, et le store + redirect au paywall.

- [ ] **Step 1: Create the component**

Create `components/landing/landing-public.tsx` :

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PublicHeader } from './public-header'
import { LandingHero, type LandingHeroHandle } from './landing-hero'
import { UseCasesSection } from './use-cases-section'
import { BlurredPreview } from './blurred-preview'
import { LoadingOverlay } from './loading-overlay'
import { storePendingDescription } from '@/lib/pending-description'
import { generatePreview, type Preview } from '@/lib/preview-generator'

const LOADING_PHASES = [
  'Analyse de votre demande par l’IA…',
  'Extraction des rôles, secteurs et localisations…',
  'Conversion en filtres NAF et départements…',
  'Création de votre première cible…',
] as const

const ANIMATION_TOTAL_MS = 6000  // 4 phases × 1.5s

type Phase = 'idle' | 'parsing' | 'reveal'

export function LandingPublic() {
  const router = useRouter()
  const heroRef = useRef<LandingHeroHandle>(null)

  const [description, setDescription] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [loadingPhase, setLoadingPhase] = useState(0)
  const [preview, setPreview] = useState<Preview | null>(null)

  // Cycle loading messages every 1.5s while parsing.
  useEffect(() => {
    if (phase !== 'parsing') return
    const id = setInterval(() => {
      setLoadingPhase(p => (p + 1) % LOADING_PHASES.length)
    }, 1500)
    return () => clearInterval(id)
  }, [phase])

  // Transition parsing → reveal after ANIMATION_TOTAL_MS.
  useEffect(() => {
    if (phase !== 'parsing') return
    const t = setTimeout(() => {
      setPreview(generatePreview(description))
      setPhase('reveal')
    }, ANIMATION_TOTAL_MS)
    return () => clearTimeout(t)
  }, [phase, description])

  function handleSubmit() {
    if (!description.trim() || phase !== 'idle') return
    setLoadingPhase(0)
    setPhase('parsing')
  }

  function handlePickUseCase(desc: string) {
    if (phase !== 'idle') return
    setDescription(desc)
    heroRef.current?.scrollIntoView()
    // Tiny delay so scroll lands before focus visually.
    setTimeout(() => heroRef.current?.focus(), 320)
  }

  function handleSignup() {
    storePendingDescription(description)
    router.push('/signup')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <PublicHeader />

      {phase === 'reveal' && preview ? (
        <main style={{ flex: 1, paddingTop: 32 }}>
          <BlurredPreview query={description} preview={preview} onSignup={handleSignup} />
        </main>
      ) : (
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <LandingHero
            ref={heroRef}
            description={description}
            onDescriptionChange={setDescription}
            onSubmit={handleSubmit}
            disabled={phase !== 'idle'}
          />
          <UseCasesSection onPick={handlePickUseCase} />
        </main>
      )}

      {phase === 'parsing' && <LoadingOverlay message={LOADING_PHASES[loadingPhase]} />}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/landing/landing-public.tsx
git commit -m "feat(landing): add LandingPublic orchestrator (state machine idle→parsing→reveal)"
```

---

## Task 9 : Refactor `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Read the current file**

Read `app/page.tsx` to confirm the current logic before editing.

- [ ] **Step 2: Replace the file content**

Replace the entire file with:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LandingPublic } from '@/components/landing/landing-public'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Anonymous visitor → public landing (commercial demo).
  if (!user) return <LandingPublic />

  // Connected user without org membership → onboarding to create the first persona.
  const { data: membership } = await supabase
    .from('prospection_organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) redirect('/cible')

  // Connected user with an org → straight to their pipeline.
  redirect('/suivi')
}
```

- [ ] **Step 3: Manually verify in dev server**

Start the dev server: `npm run dev`

Open `http://localhost:3000/` in a browser **logged out** (use a private window).
Expected: PublicHeader + Hero "Qui cherchez-vous ?" + 3 use case cards visible.

Then login and revisit `http://localhost:3000/`.
Expected: redirect to `/suivi`.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat(landing): make / a public landing page; connected users redirect to /suivi"
```

---

## Task 10 : Consume pending description in `/signup`

**Files:**
- Modify: `app/(auth)/signup/page.tsx`

- [ ] **Step 1: Read the current file**

Read `app/(auth)/signup/page.tsx` to anchor the diff.

- [ ] **Step 2: Add the pending-description consume after signin**

Edit `app/(auth)/signup/page.tsx`. Add the import at the top:

```tsx
import { consumePendingDescription } from '@/lib/pending-description'
```

Then locate the block:

```tsx
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    router.push('/pipeline')
```

Replace with:

```tsx
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    const pendingDesc = consumePendingDescription()
    if (pendingDesc) {
      try {
        const personaRes = await fetch('/api/personas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: pendingDesc }),
        })
        const personaData = await personaRes.json()
        if (personaRes.ok && personaData.persona?.id) {
          router.push(`/recherche?persona=${personaData.persona.id}`)
          return
        }
      } catch {
        // Silent fallback: persona creation failed, drop user on pipeline.
      }
    }

    router.push('/pipeline')
```

- [ ] **Step 3: Manual verify**

In a logged-out private window:
1. Open `/`, type "Comptables en Gironde", click "Lancer la recherche".
2. Wait for the animation to finish, click "Commencer" on the paywall.
3. On `/signup`, fill the form with a fresh email + name + password.
4. Submit.

Expected: lands on `/recherche?persona=<id>` with the description "Comptables en Gironde" already parsed.

- [ ] **Step 4: Commit**

```bash
git add app/\(auth\)/signup/page.tsx
git commit -m "feat(landing): create persona from pending description after signup"
```

---

## Task 11 : Consume pending description in `/login`

**Files:**
- Modify: `app/(auth)/login/page.tsx`

Même branche post-auth pour les visiteurs qui cliquent "Connexion" depuis la landing au lieu de "Commencer".

- [ ] **Step 1: Read the current file**

Read `app/(auth)/login/page.tsx`.

- [ ] **Step 2: Add the consume logic post-signin**

Add the import at the top:

```tsx
import { consumePendingDescription } from '@/lib/pending-description'
```

Find the block where login succeeds (likely a `router.push('/suivi')` or `router.push('/pipeline')` after `signInWithPassword`).

Wrap it with the same logic as Task 10:

```tsx
    const pendingDesc = consumePendingDescription()
    if (pendingDesc) {
      try {
        const personaRes = await fetch('/api/personas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: pendingDesc }),
        })
        const personaData = await personaRes.json()
        if (personaRes.ok && personaData.persona?.id) {
          router.push(`/recherche?persona=${personaData.persona.id}`)
          return
        }
      } catch {
        // Silent fallback: persona creation failed, fall through to default redirect.
      }
    }

    router.push('/suivi')  // or whatever the existing default is — preserve it
```

(Note : la cible exacte du `router.push` par défaut dépend du code actuel — préserver la valeur existante. Si c'est `/pipeline`, garder `/pipeline`.)

- [ ] **Step 3: Manual verify**

In a logged-out private window with an EXISTING account :
1. Open `/`, type "Vétérinaires diplômés", click "Lancer la recherche".
2. After animation, click "Commencer" on paywall.
3. On `/signup`, click "Se connecter" → arrive sur `/login`.
4. Login with existing credentials.

Expected: lands on `/recherche?persona=<id>` with "Vétérinaires diplômés".

Then test the no-pending-desc path:
1. Direct visit `/login`, login.
Expected: lands on the existing default redirect (probably `/suivi`).

- [ ] **Step 4: Commit**

```bash
git add app/\(auth\)/login/page.tsx
git commit -m "feat(landing): create persona from pending description after login (returning visitor)"
```

---

## Task 12 : Cleanup ancien `HeroSearch`

**Files:**
- Delete: `components/search/hero-search.tsx`
- Delete: `components/search/` (if empty)

- [ ] **Step 1: Confirm no other usage**

Run: `grep -rn "HeroSearch\|hero-search" --include="*.tsx" --include="*.ts" .`
Expected: only the comment in `components/recherche/recherche-page-client.tsx:16` (which references the post-create flow conceptually). No import.

- [ ] **Step 2: Delete the file**

Run: `rm components/search/hero-search.tsx && rmdir components/search 2>/dev/null || true`

- [ ] **Step 3: Update the dangling comment**

Edit `components/recherche/recherche-page-client.tsx:16` :

Change:
```tsx
  // Honor ?persona=<id> deeplink (used by hero-search post-create flow).
```

To:
```tsx
  // Honor ?persona=<id> deeplink (used by signup/login post-create flow).
```

- [ ] **Step 4: Verify build still passes**

Run: `npm run build`
Expected: Build succeeds. No "Module not found: HeroSearch" error.

- [ ] **Step 5: Commit**

```bash
git add -A components/search components/recherche/recherche-page-client.tsx
git commit -m "chore(landing): remove unused HeroSearch component (replaced by LandingPublic)"
```

---

## Task 13 : Smoke test du flux complet (manual QA)

Pas de code à écrire — vérification end-to-end.

- [ ] **Step 1: Run dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test scenario A — anonymous → signup**

Private/incognito window :
1. Open `http://localhost:3000/` — vérifier : header avec "Connexion", hero "Qui cherchez-vous ?", 3 cartes use cases.
2. Cliquer une carte use case (ex "Chirurgiens proches de la retraite") — vérifier : champ pré-rempli + scroll vers le hero.
3. Cliquer "Lancer la recherche" — vérifier : overlay loading apparaît, 4 phases qui défilent (~6s).
4. Après l'animation — vérifier : 4 cartes floutées apparaissent en stagger, paywall sticky en bas avec un nombre cohérent ("X prospects identifiés").
5. Re-cliquer "Lancer la recherche" pour la même query (refresh de la page d'abord) — vérifier : même nombre de prospects (déterminisme).
6. Cliquer "Commencer" — vérifier : redirige sur `/signup`.
7. Créer un compte avec email frais — vérifier : après submit, redirige sur `/recherche?persona=<id>` avec la description parsée.

- [ ] **Step 3: Test scenario B — anonymous → login (compte existant)**

Private window :
1. Répéter étapes 1-6 avec une autre query.
2. Sur `/signup`, cliquer "Se connecter" → arrive sur `/login`.
3. Login avec un compte existant — vérifier : redirige sur `/recherche?persona=<id>`.

- [ ] **Step 4: Test scenario C — utilisateur connecté visite `/`**

1. Connecté, ouvrir `http://localhost:3000/` — vérifier : redirect immédiat vers `/suivi`.
2. Connecté sans org (rare, mais possible si org créée puis supprimée) : vérifier redirect vers `/cible`.

- [ ] **Step 5: Test scenario D — query vide ou trop courte**

Anonymous :
1. Ouvrir `/`, ne rien taper, observer le bouton "Lancer la recherche" — vérifier : disabled (opacity 0.5, cursor not-allowed).
2. Taper "  " (espaces seuls) — bouton toujours disabled.

- [ ] **Step 6: Test scenario E — cohérence visuelle DESIGN.md**

Vérifier sur la landing :
- Background `#F3EFE6` (parchment) — pas de blanc.
- Aucun `border-radius` > 2px sur les cartes / boutons.
- Titre Fraunces, body Plus Jakarta, scores en Geist Mono tabular.
- Accent copper `#BC6B2A` sur les CTA et hovers (pas de violet/gold).

- [ ] **Step 7: Final commit (si fixes nécessaires)**

Si le smoke test révèle des bugs visuels ou comportementaux, créer un commit de fix dédié :

```bash
git add -A
git commit -m "fix(landing): <description du fix>"
```

Si tout passe, pas de commit nécessaire.

---

## Self-Review (post-rédaction du plan)

**1. Spec coverage :**
- Routage `/` connecté → `/suivi`, anonyme → landing : Task 9 ✓
- Header public avec Connexion seul : Task 3 ✓
- Hero modifié (sous-titre, label bouton, anonymous-only) : Task 5 ✓
- Section 3 cas d'usage cliquables : Task 6 ✓
- Animation + 4 cartes floutées + paywall sticky : Tasks 4 + 7 + 8 ✓
- Compteur déterministe par query : Task 2 ✓
- Pas de mention "aperçu illustratif" : confirmé absent du Task 7 ✓
- Persistance description (sessionStorage helper) : Task 1 ✓
- Consume post-signin signup + login : Tasks 10 + 11 ✓
- Cleanup HeroSearch : Task 12 ✓

**2. Placeholder scan :**
Aucun "TBD/TODO/handle edge cases" non spécifié. Tous les blocs de code sont complets.

**3. Type consistency :**
- `Preview` et `PreviewCard` définis dans `lib/preview-generator.ts` (Task 2), importés en Task 7 et 8 ✓
- `LandingHeroHandle` exporté depuis `landing-hero.tsx` (Task 5), consommé via `useRef` en Task 8 ✓
- `storePendingDescription` / `consumePendingDescription` cohérents entre Tasks 1, 8, 10, 11 ✓
- `generatePreview(query)` retourne `Preview` partout ✓

Plan complet, exhaustif, prêt à exécution.
