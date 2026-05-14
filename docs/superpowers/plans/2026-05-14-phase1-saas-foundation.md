# Charlie Prospection — Phase 1 : SaaS Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffolder un SaaS multi-tenant opérationnel avec auth, organisations isolées par RLS, billing Stripe, app shell, et la première feature : l'ICP Builder (langage naturel → Claude → critères de prospection).

**Architecture:** Next.js 15 App Router avec Supabase pour l'auth et la base de données (RLS par `organization_id`). Chaque cabinet CGP est une `organization` isolée. Stripe gère les plans starter/pro. Claude Sonnet 4.6 parse les descriptions d'ICP en langage naturel.

**Tech Stack:** Next.js 15, TypeScript strict, Tailwind CSS 4, Radix UI, Supabase SSR, Stripe, Claude Sonnet 4.6 via @anthropic-ai/sdk, Vitest

---

## File Structure

```
charlie-prospection/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx              — page de connexion
│   │   ├── signup/page.tsx             — page d'inscription
│   │   ├── callback/route.ts           — callback OAuth Supabase
│   │   └── layout.tsx                  — layout auth (centré, sans sidebar)
│   ├── (app)/
│   │   ├── layout.tsx                  — layout principal avec sidebar
│   │   ├── dashboard/page.tsx          — dashboard stub avec métriques
│   │   ├── icp/page.tsx                — ICP Builder
│   │   ├── prospects/page.tsx          — liste prospects (stub Phase 2)
│   │   ├── pipeline/page.tsx           — CRM kanban (stub Phase 4)
│   │   ├── outreach/page.tsx           — outreach (stub Phase 4)
│   │   └── settings/
│   │       ├── page.tsx                — paramètres cabinet
│   │       └── billing/page.tsx        — gestion abonnement Stripe
│   ├── api/
│   │   ├── icp/
│   │   │   ├── parse/route.ts          — POST: langage naturel → Claude → critères
│   │   │   └── [id]/route.ts           — GET/PATCH/DELETE ICP
│   │   └── webhooks/
│   │       └── stripe/route.ts         — webhook Stripe (checkout, invoices)
│   ├── layout.tsx                      — root layout
│   └── globals.css
├── components/
│   ├── ui/
│   │   ├── button.tsx                  — Button Radix-based
│   │   ├── input.tsx                   — Input
│   │   ├── badge.tsx                   — Badge (scores, signaux)
│   │   ├── card.tsx                    — Card container
│   │   └── textarea.tsx                — Textarea
│   ├── layout/
│   │   ├── sidebar.tsx                 — navigation latérale
│   │   └── header.tsx                  — header avec org switcher
│   └── icp/
│       ├── icp-builder.tsx             — composant principal ICP Builder
│       └── criteria-tags.tsx           — tags éditables des critères parsés
├── lib/
│   ├── supabase/
│   │   ├── client.ts                   — createBrowserClient
│   │   ├── server.ts                   — createServerClient (cookies)
│   │   └── middleware.ts               — refreshSession helper
│   ├── claude/
│   │   └── icp-parser.ts               — parseICP(description) → ParsedICP
│   ├── stripe/
│   │   ├── client.ts                   — Stripe instance
│   │   └── plans.ts                    — PLANS config (starter/pro)
│   └── types.ts                        — types partagés (Organization, ICP, Prospect...)
├── middleware.ts                        — protection routes + session refresh
├── supabase/
│   └── migrations/
│       └── 20260514000000_initial.sql  — schéma complet + RLS policies
├── vitest.config.ts
├── vitest.setup.ts
├── package.json
└── tsconfig.json
```

---

## Task 1 : Scaffold du projet Next.js 15

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.ts`
- Create: `app/layout.tsx`, `app/globals.css`

- [ ] **Step 1: Initialiser le projet**

```bash
cd "/Users/mathisbaala/Projects/charlie financial advisor/charlie-prospection"
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --src-dir=false \
  --import-alias="@/*" \
  --yes
```

- [ ] **Step 2: Installer les dépendances**

```bash
npm install \
  @supabase/ssr@latest \
  @supabase/supabase-js@latest \
  @anthropic-ai/sdk \
  stripe \
  @radix-ui/react-dialog \
  @radix-ui/react-dropdown-menu \
  @radix-ui/react-separator \
  @radix-ui/react-slot \
  @radix-ui/react-toast \
  @radix-ui/react-tooltip \
  @tanstack/react-query \
  lucide-react \
  clsx \
  tailwind-merge \
  class-variance-authority

npm install -D \
  vitest \
  @vitejs/plugin-react \
  @testing-library/react \
  @testing-library/jest-dom \
  @types/node \
  happy-dom
```

- [ ] **Step 3: Configurer vitest**

Créer `vitest.config.ts` :
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
```

Créer `vitest.setup.ts` :
```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Configurer les variables d'environnement**

Créer `.env.local` :
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ANTHROPIC_API_KEY=your_anthropic_key
STRIPE_SECRET_KEY=your_stripe_secret
STRIPE_WEBHOOK_SECRET=your_webhook_secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_pub_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Créer `.env.local.example` avec les mêmes clés sans valeurs.

Ajouter `.env.local` au `.gitignore`.

- [ ] **Step 5: Configurer `next.config.ts`**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'media.licdn.com' },
      { protocol: 'https', hostname: '*.licdn.com' },
    ],
  },
}

export default nextConfig
```

- [ ] **Step 6: Vérifier que le projet compile**

```bash
npm run build
```
Expected : build réussi sans erreurs TypeScript.

- [ ] **Step 7: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold Next.js 15 project with dependencies"
```

---

## Task 2 : Schéma Supabase + migrations

**Files:**
- Create: `supabase/migrations/20260514000000_initial.sql`

- [ ] **Step 1: Installer la CLI Supabase**

```bash
npm install -D supabase
npx supabase init
```

- [ ] **Step 2: Écrire la migration SQL**

Créer `supabase/migrations/20260514000000_initial.sql` :

```sql
-- Extensions
create extension if not exists "uuid-ossp";

-- Organizations (cabinets CGP)
create table organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text not null default 'starter' check (plan in ('starter', 'pro')),
  created_at timestamptz not null default now()
);

-- Organization members
create table organization_members (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique(org_id, user_id)
);

-- ICPs (Ideal Customer Profiles)
create table icps (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  raw_description text not null,
  parsed_criteria jsonb not null default '{}',
  linkedin_queries jsonb not null default '[]',
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Prospects
create table prospects (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references organizations(id) on delete cascade,
  icp_id uuid references icps(id) on delete set null,
  linkedin_url text not null,
  linkedin_data jsonb not null default '{}',
  enrichment_data jsonb not null default '{}',
  patrimony_score integer check (patrimony_score between 0 and 100),
  icp_score integer check (icp_score between 0 and 100),
  crm_stage text not null default 'new' check (
    crm_stage in ('new', 'to_contact', 'contacted', 'meeting', 'client', 'lost')
  ),
  created_at timestamptz not null default now(),
  last_signal_at timestamptz,
  unique(org_id, linkedin_url)
);

-- Signals
create table signals (
  id uuid primary key default uuid_generate_v4(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  type text not null check (type in (
    'cession_entreprise', 'levee_fonds', 'creation_holding', 'transaction_immo',
    'nouveau_poste', 'installation_cabinet', 'post_linkedin', 'retraite_imminente',
    'divorce', 'succession', 'augmentation_capital'
  )),
  source text not null check (source in (
    'bodacc', 'sirene', 'dvf', 'rpps', 'jo', 'linkedin', 'infogreffe'
  )),
  data jsonb not null default '{}',
  valeur_estimee numeric,
  detected_at timestamptz not null default now(),
  read boolean not null default false
);

-- Outreach messages
create table outreach_messages (
  id uuid primary key default uuid_generate_v4(),
  prospect_id uuid not null references prospects(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  channel text not null check (channel in ('linkedin', 'email')),
  content text not null,
  signals_used jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent', 'replied')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- RLS: activer sur toutes les tables
alter table organizations enable row level security;
alter table organization_members enable row level security;
alter table icps enable row level security;
alter table prospects enable row level security;
alter table signals enable row level security;
alter table outreach_messages enable row level security;

-- Helper: org_ids de l'utilisateur courant
create or replace function my_org_ids()
returns setof uuid language sql security definer stable as $$
  select org_id from organization_members where user_id = auth.uid()
$$;

-- RLS policies: organizations
create policy "members can view their org"
  on organizations for select
  using (id in (select my_org_ids()));

create policy "owners can update their org"
  on organizations for update
  using (id in (
    select org_id from organization_members
    where user_id = auth.uid() and role = 'owner'
  ));

-- RLS policies: organization_members
create policy "members can view org members"
  on organization_members for select
  using (org_id in (select my_org_ids()));

-- RLS policies: icps
create policy "org members can manage icps"
  on icps for all
  using (org_id in (select my_org_ids()));

-- RLS policies: prospects
create policy "org members can manage prospects"
  on prospects for all
  using (org_id in (select my_org_ids()));

-- RLS policies: signals
create policy "org members can manage signals"
  on signals for all
  using (org_id in (select my_org_ids()));

-- RLS policies: outreach_messages
create policy "org members can manage outreach"
  on outreach_messages for all
  using (org_id in (select my_org_ids()));

-- Indexes
create index idx_prospects_org_id on prospects(org_id);
create index idx_prospects_crm_stage on prospects(org_id, crm_stage);
create index idx_signals_prospect_id on signals(prospect_id);
create index idx_signals_org_unread on signals(org_id, read) where read = false;
create index idx_outreach_prospect_id on outreach_messages(prospect_id);
```

- [ ] **Step 3: Connecter Supabase CLI au projet**

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```
Remplacer `YOUR_PROJECT_REF` par l'ID du projet Supabase (visible dans les settings du projet).

- [ ] **Step 4: Appliquer la migration**

```bash
npx supabase db push
```
Expected : migration appliquée sans erreurs.

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "feat: add complete database schema with RLS policies"
```

---

## Task 3 : Types TypeScript partagés

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: Écrire les types**

Créer `lib/types.ts` :
```typescript
export type Plan = 'starter' | 'pro'
export type OrgRole = 'owner' | 'member'
export type CrmStage = 'new' | 'to_contact' | 'contacted' | 'meeting' | 'client' | 'lost'
export type SignalType =
  | 'cession_entreprise' | 'levee_fonds' | 'creation_holding' | 'transaction_immo'
  | 'nouveau_poste' | 'installation_cabinet' | 'post_linkedin' | 'retraite_imminente'
  | 'divorce' | 'succession' | 'augmentation_capital'
export type SignalSource = 'bodacc' | 'sirene' | 'dvf' | 'rpps' | 'jo' | 'linkedin' | 'infogreffe'
export type OutreachChannel = 'linkedin' | 'email'
export type OutreachStatus = 'draft' | 'approved' | 'sent' | 'replied'
export type IcpStatus = 'active' | 'paused'

export interface Organization {
  id: string
  name: string
  slug: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  plan: Plan
  created_at: string
}

export interface OrganizationMember {
  id: string
  org_id: string
  user_id: string
  role: OrgRole
  created_at: string
}

export interface ParsedIcpCriteria {
  roles: string[]
  sectors: string[]
  locations: string[]
  seniority_min_years?: number
  patrimony_level?: 'standard' | 'high' | 'very_high'
  keywords: string[]
  signal_priorities: SignalType[]
}

export interface Icp {
  id: string
  org_id: string
  raw_description: string
  parsed_criteria: ParsedIcpCriteria
  linkedin_queries: string[]
  status: IcpStatus
  created_at: string
  updated_at: string
}

export interface Prospect {
  id: string
  org_id: string
  icp_id: string | null
  linkedin_url: string
  linkedin_data: Record<string, unknown>
  enrichment_data: Record<string, unknown>
  patrimony_score: number | null
  icp_score: number | null
  crm_stage: CrmStage
  created_at: string
  last_signal_at: string | null
}

export interface Signal {
  id: string
  prospect_id: string
  org_id: string
  type: SignalType
  source: SignalSource
  data: Record<string, unknown>
  valeur_estimee: number | null
  detected_at: string
  read: boolean
}

export interface OutreachMessage {
  id: string
  prospect_id: string
  org_id: string
  channel: OutreachChannel
  content: string
  signals_used: string[]
  status: OutreachStatus
  sent_at: string | null
  created_at: string
}
```

- [ ] **Step 2: Vérifier la compilation TypeScript**

```bash
npx tsc --noEmit
```
Expected : 0 erreurs.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add shared TypeScript types"
```

---

## Task 4 : Clients Supabase (browser + server)

**Files:**
- Create: `lib/supabase/client.ts`
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/middleware.ts`
- Create: `middleware.ts`

- [ ] **Step 1: Client browser**

Créer `lib/supabase/client.ts` :
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 2: Client server**

Créer `lib/supabase/server.ts` :
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

- [ ] **Step 3: Middleware helper**

Créer `lib/supabase/middleware.ts` :
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/signup')
  const isCallbackRoute = request.nextUrl.pathname.startsWith('/callback')

  if (!user && !isAuthRoute && !isCallbackRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
```

- [ ] **Step 4: Middleware Next.js**

Créer `middleware.ts` à la racine :
```typescript
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/ middleware.ts
git commit -m "feat: add Supabase client and auth middleware"
```

---

## Task 5 : Pages d'authentification

**Files:**
- Create: `app/(auth)/layout.tsx`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/signup/page.tsx`
- Create: `app/(auth)/callback/route.ts`

- [ ] **Step 1: Layout auth**

Créer `app/(auth)/layout.tsx` :
```typescript
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Charlie Prospection</h1>
          <p className="text-sm text-gray-500 mt-1">Prospection patrimoniale pour CGPs</p>
        </div>
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Page de connexion**

Créer `app/(auth)/login/page.tsx` :
```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Connexion</h2>
      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="vous@cabinet.fr"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
      <p className="text-center text-sm text-gray-500 mt-4">
        Pas encore de compte ?{' '}
        <Link href="/signup" className="text-indigo-600 hover:underline font-medium">
          Créer un cabinet
        </Link>
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Page d'inscription**

Créer `app/(auth)/signup/page.tsx` :
```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { cabinet_name: name } },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Créer votre cabinet</h2>
      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nom du cabinet</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Cabinet Dupont Patrimoine"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="vous@cabinet.fr"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Création...' : 'Créer mon cabinet'}
        </button>
      </form>
      <p className="text-center text-sm text-gray-500 mt-4">
        Déjà un compte ?{' '}
        <Link href="/login" className="text-indigo-600 hover:underline font-medium">
          Se connecter
        </Link>
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Callback OAuth**

Créer `app/(auth)/callback/route.ts` :
```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
```

- [ ] **Step 5: Démarrer le serveur et vérifier les pages auth**

```bash
npm run dev
```
Ouvrir http://localhost:3000/login — vérifier que la page s'affiche sans erreurs console.
Ouvrir http://localhost:3000 — vérifier la redirection vers /login.

- [ ] **Step 6: Commit**

```bash
git add app/\(auth\)/
git commit -m "feat: add auth pages (login, signup, callback)"
```

---

## Task 6 : Création automatique d'organisation au signup

**Files:**
- Create: `app/api/auth/create-org/route.ts`
- Modify: `app/(auth)/signup/page.tsx`

La création de l'org doit se faire server-side avec le service role key (contournement du RLS). On utilise une API route dédiée appelée juste après le signup.

- [ ] **Step 1: Écrire le test**

Créer `lib/__tests__/create-org.test.ts` :
```typescript
import { describe, it, expect } from 'vitest'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

describe('slugify', () => {
  it('converts cabinet name to slug', () => {
    expect(slugify('Cabinet Dupont Patrimoine')).toBe('cabinet-dupont-patrimoine')
  })
  it('handles accents', () => {
    expect(slugify('Société Générale')).toBe('societe-generale')
  })
  it('handles special characters', () => {
    expect(slugify('CGP & Associés')).toBe('cgp-associes')
  })
})
```

- [ ] **Step 2: Vérifier que le test passe**

```bash
npx vitest run lib/__tests__/create-org.test.ts
```
Expected : 3 tests PASS.

- [ ] **Step 3: API route de création d'org**

Créer `app/api/auth/create-org/route.ts` :
```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Vérifier si l'user a déjà une org
  const { data: existing } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single()
  if (existing) return NextResponse.json({ org_id: existing.org_id })

  const { name } = await request.json()
  const cabinetName = name || user.user_metadata?.cabinet_name || 'Mon Cabinet'
  const baseSlug = slugify(cabinetName)
  const slug = `${baseSlug}-${Date.now().toString(36)}`

  // Service client pour bypasser RLS sur la création
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: org, error: orgError } = await service
    .from('organizations')
    .insert({ name: cabinetName, slug })
    .select()
    .single()
  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 500 })

  await service
    .from('organization_members')
    .insert({ org_id: org.id, user_id: user.id, role: 'owner' })

  return NextResponse.json({ org_id: org.id })
}
```

- [ ] **Step 4: Appeler l'API au login/signup**

Modifier `app/(auth)/signup/page.tsx` — remplacer le `router.push('/dashboard')` par :
```typescript
// après signUp réussi, avant router.push
await fetch('/api/auth/create-org', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name }),
})
router.push('/dashboard')
```

Modifier `app/(auth)/login/page.tsx` — remplacer le `router.push('/dashboard')` par :
```typescript
await fetch('/api/auth/create-org', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({}),
})
router.push('/dashboard')
```

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/ app/\(auth\)/ lib/__tests__/
git commit -m "feat: auto-create organization on user signup"
```

---

## Task 7 : App shell (layout + sidebar)

**Files:**
- Create: `components/layout/sidebar.tsx`
- Create: `app/(app)/layout.tsx`
- Create: `app/(app)/dashboard/page.tsx`
- Create: `app/(app)/prospects/page.tsx`
- Create: `app/(app)/icp/page.tsx`
- Create: `app/(app)/pipeline/page.tsx`
- Create: `app/(app)/settings/page.tsx`

- [ ] **Step 1: Sidebar**

Créer `components/layout/sidebar.tsx` :
```typescript
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, Zap, LayoutKanban, MessageSquare, Settings, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { clsx } from 'clsx'

const NAV_ITEMS = [
  { href: '/prospects', label: 'Prospects', icon: Users },
  { href: '/icp', label: 'Mon ICP', icon: Zap },
  { href: '/pipeline', label: 'Pipeline CRM', icon: LayoutKanban },
  { href: '/outreach', label: 'Outreach', icon: MessageSquare },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-60 min-h-screen bg-gray-900 flex flex-col">
      <div className="p-5 border-b border-gray-800">
        <h1 className="text-white font-bold text-lg">Charlie</h1>
        <p className="text-gray-400 text-xs mt-0.5">Prospection</p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname.startsWith(href)
                ? 'bg-indigo-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            )}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t border-gray-800 space-y-1">
        <Link
          href="/settings"
          className={clsx(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
            pathname.startsWith('/settings')
              ? 'bg-indigo-600 text-white'
              : 'text-gray-400 hover:bg-gray-800 hover:text-white'
          )}
        >
          <Settings size={16} />
          Paramètres
        </Link>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <LogOut size={16} />
          Déconnexion
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: App layout**

Créer `app/(app)/layout.tsx` :
```typescript
import { Sidebar } from '@/components/layout/sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Page dashboard**

Créer `app/(app)/dashboard/page.tsx` :
```typescript
export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
      <p className="text-gray-500 mt-1">Bienvenue sur Charlie Prospection.</p>
      <div className="grid grid-cols-3 gap-6 mt-8">
        {[
          { label: 'Prospects identifiés', value: '0', color: 'indigo' },
          { label: 'Signaux cette semaine', value: '0', color: 'green' },
          { label: 'Messages envoyés', value: '0', color: 'purple' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-6">
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Pages stub pour les autres routes**

Créer `app/(app)/prospects/page.tsx` :
```typescript
export default function ProspectsPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900">Prospects</h1>
      <p className="text-gray-500 mt-1">Disponible en Phase 2.</p>
    </div>
  )
}
```

Créer `app/(app)/pipeline/page.tsx` :
```typescript
export default function PipelinePage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900">Pipeline CRM</h1>
      <p className="text-gray-500 mt-1">Disponible en Phase 4.</p>
    </div>
  )
}
```

Créer `app/(app)/settings/page.tsx` :
```typescript
export default function SettingsPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
    </div>
  )
}
```

- [ ] **Step 5: Vérifier le routing**

```bash
npm run dev
```
Se connecter → vérifier que `/dashboard` affiche la sidebar + le contenu. Cliquer tous les liens de nav → vérifier qu'aucune 404.

- [ ] **Step 6: Commit**

```bash
git add components/layout/ app/\(app\)/
git commit -m "feat: add app shell with sidebar navigation and route stubs"
```

---

## Task 8 : ICP Parser (Claude API)

**Files:**
- Create: `lib/claude/icp-parser.ts`
- Create: `lib/claude/__tests__/icp-parser.test.ts`

- [ ] **Step 1: Écrire les tests**

Créer `lib/claude/__tests__/icp-parser.test.ts` :
```typescript
import { describe, it, expect } from 'vitest'
import { buildIcpParserPrompt, parseIcpResponse } from '../icp-parser'

describe('buildIcpParserPrompt', () => {
  it('includes the raw description in the prompt', () => {
    const prompt = buildIcpParserPrompt('médecins en IDF')
    expect(prompt).toContain('médecins en IDF')
  })
  it('requests JSON output', () => {
    const prompt = buildIcpParserPrompt('test')
    expect(prompt.toLowerCase()).toContain('json')
  })
})

describe('parseIcpResponse', () => {
  it('parses valid JSON from Claude response', () => {
    const json = JSON.stringify({
      roles: ['médecin généraliste'],
      sectors: ['santé'],
      locations: ['Île-de-France'],
      seniority_min_years: 2,
      patrimony_level: 'standard',
      keywords: ['cabinet', 'libéral'],
      signal_priorities: ['installation_cabinet'],
      linkedin_queries: ['médecin généraliste Île-de-France'],
    })
    const result = parseIcpResponse(json)
    expect(result.criteria.roles).toEqual(['médecin généraliste'])
    expect(result.criteria.locations).toContain('Île-de-France')
    expect(result.linkedinQueries).toHaveLength(1)
  })
  it('returns empty defaults on invalid JSON', () => {
    const result = parseIcpResponse('not json')
    expect(result.criteria.roles).toEqual([])
    expect(result.linkedinQueries).toEqual([])
  })
})
```

- [ ] **Step 2: Vérifier que les tests échouent**

```bash
npx vitest run lib/claude/__tests__/icp-parser.test.ts
```
Expected : FAIL — module not found.

- [ ] **Step 3: Implémenter le parser**

Créer `lib/claude/icp-parser.ts` :
```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { ParsedIcpCriteria, SignalType } from '@/lib/types'

export function buildIcpParserPrompt(description: string): string {
  return `Tu es un assistant spécialisé pour des CGPs (Conseillers en Gestion de Patrimoine) en France.

Un CGP vient de décrire son client idéal (ICP) en langage naturel :
"${description}"

Analyse cette description et retourne un JSON structuré avec exactement ces champs :
{
  "roles": ["liste des rôles/métiers ciblés"],
  "sectors": ["liste des secteurs d'activité"],
  "locations": ["liste des villes/régions"],
  "seniority_min_years": null ou nombre d'années minimum d'ancienneté,
  "patrimony_level": "standard" | "high" | "very_high",
  "keywords": ["mots-clés LinkedIn pertinents pour la recherche"],
  "signal_priorities": ["types de signaux les plus pertinents pour ce profil"],
  "linkedin_queries": ["2-3 requêtes LinkedIn optimisées pour trouver ces profils"]
}

Pour signal_priorities, utilise uniquement ces valeurs : cession_entreprise, levee_fonds, creation_holding, transaction_immo, nouveau_poste, installation_cabinet, post_linkedin, retraite_imminente, divorce, succession, augmentation_capital.

Réponds UNIQUEMENT avec le JSON, sans markdown, sans explication.`
}

export function parseIcpResponse(text: string): {
  criteria: ParsedIcpCriteria
  linkedinQueries: string[]
} {
  const empty: ParsedIcpCriteria = {
    roles: [], sectors: [], locations: [],
    keywords: [], signal_priorities: [],
  }
  try {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(clean)
    return {
      criteria: {
        roles: parsed.roles ?? [],
        sectors: parsed.sectors ?? [],
        locations: parsed.locations ?? [],
        seniority_min_years: parsed.seniority_min_years ?? undefined,
        patrimony_level: parsed.patrimony_level ?? undefined,
        keywords: parsed.keywords ?? [],
        signal_priorities: (parsed.signal_priorities ?? []) as SignalType[],
      },
      linkedinQueries: parsed.linkedin_queries ?? [],
    }
  } catch {
    return { criteria: empty, linkedinQueries: [] }
  }
}

export async function parseIcp(description: string) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: buildIcpParserPrompt(description) }],
  })
  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  return parseIcpResponse(text)
}
```

- [ ] **Step 4: Vérifier que les tests passent**

```bash
npx vitest run lib/claude/__tests__/icp-parser.test.ts
```
Expected : 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/claude/
git commit -m "feat: add Claude ICP parser with tests"
```

---

## Task 9 : API route ICP

**Files:**
- Create: `app/api/icp/parse/route.ts`
- Create: `app/api/icp/[id]/route.ts`

- [ ] **Step 1: Route de parsing**

Créer `app/api/icp/parse/route.ts` :
```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseIcp } from '@/lib/claude/icp-parser'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { description } = await request.json()
  if (!description?.trim()) {
    return NextResponse.json({ error: 'Description requise' }, { status: 400 })
  }

  // Récupérer l'org de l'utilisateur
  const { data: membership } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 400 })

  const { criteria, linkedinQueries } = await parseIcp(description)

  const { data: icp, error } = await supabase
    .from('icps')
    .upsert({
      org_id: membership.org_id,
      raw_description: description,
      parsed_criteria: criteria,
      linkedin_queries: linkedinQueries,
      status: 'active',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'org_id' })  // un seul ICP actif par org pour l'instant
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ icp })
}
```

- [ ] **Step 2: Route CRUD ICP**

Créer `app/api/icp/[id]/route.ts` :
```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.from('icps').select().eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ icp: data })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { data, error } = await supabase
    .from('icps')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ icp: data })
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/icp/
git commit -m "feat: add ICP API routes (parse + CRUD)"
```

---

## Task 10 : ICP Builder — UI

**Files:**
- Create: `components/icp/criteria-tags.tsx`
- Create: `components/icp/icp-builder.tsx`
- Modify: `app/(app)/icp/page.tsx`

- [ ] **Step 1: Composant CriteriaTags**

Créer `components/icp/criteria-tags.tsx` :
```typescript
'use client'
import { X } from 'lucide-react'
import type { ParsedIcpCriteria } from '@/lib/types'

const SIGNAL_LABELS: Record<string, string> = {
  cession_entreprise: 'Cession entreprise',
  levee_fonds: 'Levée de fonds',
  creation_holding: 'Création holding/SCI',
  transaction_immo: 'Transaction immo',
  nouveau_poste: 'Nouveau poste',
  installation_cabinet: 'Installation cabinet',
  post_linkedin: 'Post LinkedIn',
  retraite_imminente: 'Retraite imminente',
  divorce: 'Divorce',
  succession: 'Succession',
  augmentation_capital: 'Augmentation de capital',
}

interface Props {
  criteria: ParsedIcpCriteria
  onChange: (criteria: ParsedIcpCriteria) => void
}

function TagGroup({ label, items, color, onRemove }: {
  label: string
  items: string[]
  color: string
  onRemove: (item: string) => void
}) {
  if (!items.length) return null
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map(item => (
          <span key={item} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${color}`}>
            {SIGNAL_LABELS[item] ?? item}
            <button onClick={() => onRemove(item)} className="hover:opacity-70">
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

export function CriteriaTags({ criteria, onChange }: Props) {
  const remove = (field: keyof ParsedIcpCriteria, value: string) => {
    const current = criteria[field] as string[]
    onChange({ ...criteria, [field]: current.filter(v => v !== value) })
  }

  return (
    <div className="space-y-4">
      <TagGroup label="Rôles" items={criteria.roles} color="bg-indigo-100 text-indigo-800" onRemove={v => remove('roles', v)} />
      <TagGroup label="Secteurs" items={criteria.sectors} color="bg-blue-100 text-blue-800" onRemove={v => remove('sectors', v)} />
      <TagGroup label="Localisations" items={criteria.locations} color="bg-green-100 text-green-800" onRemove={v => remove('locations', v)} />
      <TagGroup label="Mots-clés" items={criteria.keywords} color="bg-gray-100 text-gray-700" onRemove={v => remove('keywords', v)} />
      <TagGroup label="Signaux prioritaires" items={criteria.signal_priorities} color="bg-amber-100 text-amber-800" onRemove={v => remove('signal_priorities', v)} />
      {criteria.patrimony_level && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Niveau patrimonial</p>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
            {{ standard: 'Standard (200K–1M€)', high: 'Élevé (1M–5M€)', very_high: 'Très élevé (5M€+)' }[criteria.patrimony_level]}
            <button onClick={() => onChange({ ...criteria, patrimony_level: undefined })} className="hover:opacity-70"><X size={12} /></button>
          </span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Composant IcpBuilder**

Créer `components/icp/icp-builder.tsx` :
```typescript
'use client'
import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { CriteriaTags } from './criteria-tags'
import type { Icp, ParsedIcpCriteria } from '@/lib/types'

const EXAMPLES = [
  'Médecins généralistes installés depuis moins de 5 ans en Île-de-France',
  'Dirigeants de startup tech Series A ou B, basés à Paris ou Lyon',
  'Avocats associés dans des cabinets de 10+ personnes en France',
]

interface Props {
  initialIcp?: Icp | null
}

export function IcpBuilder({ initialIcp }: Props) {
  const [description, setDescription] = useState(initialIcp?.raw_description ?? '')
  const [criteria, setCriteria] = useState<ParsedIcpCriteria | null>(
    initialIcp?.parsed_criteria ?? null
  )
  const [queries, setQueries] = useState<string[]>(initialIcp?.linkedin_queries ?? [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleParse() {
    if (!description.trim()) return
    setLoading(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/icp/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCriteria(data.icp.parsed_criteria)
      setQueries(data.icp.linkedin_queries)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Zone de texte principale */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Décrivez votre client idéal en langage naturel
        </label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Ex : Je cherche des médecins généralistes installés depuis moins de 5 ans en Île-de-France, avec un cabinet de groupe et une activité LinkedIn régulière..."
        />
        <div className="flex items-center justify-between mt-3">
          <div className="flex gap-2 flex-wrap">
            {EXAMPLES.map(ex => (
              <button
                key={ex}
                onClick={() => setDescription(ex)}
                className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
              >
                {ex.substring(0, 40)}…
              </button>
            ))}
          </div>
          <button
            onClick={handleParse}
            disabled={!description.trim() || loading}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {loading ? 'Analyse...' : 'Analyser avec IA'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>

      {/* Critères parsés */}
      {criteria && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-900">Critères extraits</h3>
            {saved && <span className="text-xs text-green-600 font-medium">✓ Sauvegardé</span>}
          </div>
          <CriteriaTags criteria={criteria} onChange={setCriteria} />
        </div>
      )}

      {/* Requêtes LinkedIn générées */}
      {queries.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-medium text-gray-900 mb-3">Requêtes LinkedIn générées</h3>
          <p className="text-sm text-gray-500 mb-4">
            Ces requêtes seront utilisées par l'extension Chrome pour trouver vos prospects.
          </p>
          <div className="space-y-2">
            {queries.map((q, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <span className="text-xs font-mono text-gray-400">#{i + 1}</span>
                <code className="text-sm text-gray-700 flex-1">{q}</code>
              </div>
            ))}
          </div>
          <div className="mt-4 p-4 bg-indigo-50 rounded-lg border border-indigo-100">
            <p className="text-sm text-indigo-700">
              <strong>Prochaine étape :</strong> Installez l'extension Chrome Charlie Prospection pour commencer à capturer les profils correspondants automatiquement.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Page ICP**

Modifier `app/(app)/icp/page.tsx` :
```typescript
import { createClient } from '@/lib/supabase/server'
import { IcpBuilder } from '@/components/icp/icp-builder'

export default async function IcpPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let existingIcp = null
  if (user) {
    const { data: membership } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single()
    if (membership) {
      const { data } = await supabase
        .from('icps')
        .select()
        .eq('org_id', membership.org_id)
        .eq('status', 'active')
        .single()
      existingIcp = data
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Mon ICP</h1>
        <p className="text-gray-500 mt-1">
          Décrivez votre client idéal — l'IA génère automatiquement les requêtes de recherche LinkedIn.
        </p>
      </div>
      <IcpBuilder initialIcp={existingIcp} />
    </div>
  )
}
```

- [ ] **Step 4: Vérifier le flow complet**

```bash
npm run dev
```
1. Se connecter → aller sur `/icp`
2. Taper une description : "Médecins généralistes installés en Île-de-France"
3. Cliquer "Analyser avec IA"
4. Vérifier que les critères apparaissent sous forme de tags
5. Vérifier que les requêtes LinkedIn sont affichées

- [ ] **Step 5: Commit**

```bash
git add components/icp/ app/\(app\)/icp/
git commit -m "feat: add ICP Builder UI with Claude-powered parsing"
```

---

## Task 11 : Vérification finale Phase 1

- [ ] **Step 1: Tests complets**

```bash
npx vitest run
```
Expected : tous les tests PASS.

- [ ] **Step 2: Build de production**

```bash
npm run build
```
Expected : build sans erreurs ni warnings TypeScript.

- [ ] **Step 3: Test du flow d'isolation multi-tenant**

1. Créer compte A (cabinet-a@test.fr)
2. Créer un ICP pour le cabinet A
3. Créer compte B (cabinet-b@test.fr) en navigation privée
4. Vérifier que le cabinet B ne voit aucun ICP du cabinet A (table vide)

- [ ] **Step 4: Commit final**

```bash
git add .
git commit -m "feat: Phase 1 complete — SaaS foundation with auth, orgs, billing, ICP Builder"
```

---

## Task 12 : Stripe billing (plans starter/pro)

**Files:**
- Create: `lib/stripe/client.ts`
- Create: `lib/stripe/plans.ts`
- Create: `app/api/webhooks/stripe/route.ts`
- Create: `app/(app)/settings/billing/page.tsx`

- [ ] **Step 1: Client Stripe + config des plans**

Créer `lib/stripe/client.ts` :
```typescript
import Stripe from 'stripe'
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-03-31.basil',
})
```

Créer `lib/stripe/plans.ts` :
```typescript
export const PLANS = {
  starter: {
    name: 'Starter',
    price_id: process.env.STRIPE_STARTER_PRICE_ID!,
    price_monthly: 99,
    limits: { prospects_per_month: 200, signals: true, outreach: false },
  },
  pro: {
    name: 'Pro',
    price_id: process.env.STRIPE_PRO_PRICE_ID!,
    price_monthly: 299,
    limits: { prospects_per_month: -1, signals: true, outreach: true },
  },
} as const
```

Ajouter dans `.env.local` :
```
STRIPE_STARTER_PRICE_ID=price_xxx
STRIPE_PRO_PRICE_ID=price_xxx
```

- [ ] **Step 2: Webhook Stripe**

Créer `app/api/webhooks/stripe/route.ts` :
```typescript
import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')!
  let event: ReturnType<typeof stripe.webhooks.constructEvent>

  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
    const sub = event.data.object as { customer: string; id: string; status: string; items: { data: Array<{ price: { id: string } }> } }
    const plan = sub.items.data[0]?.price.id === process.env.STRIPE_PRO_PRICE_ID ? 'pro' : 'starter'
    if (sub.status === 'active') {
      await service.from('organizations')
        .update({ plan, stripe_subscription_id: sub.id })
        .eq('stripe_customer_id', sub.customer)
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as { customer: string }
    await service.from('organizations')
      .update({ plan: 'starter', stripe_subscription_id: null })
      .eq('stripe_customer_id', sub.customer)
  }

  return NextResponse.json({ received: true })
}
```

- [ ] **Step 3: Page billing**

Créer `app/(app)/settings/billing/page.tsx` :
```typescript
import { createClient } from '@/lib/supabase/server'
import { PLANS } from '@/lib/stripe/plans'

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: membership } = await supabase
    .from('organization_members').select('org_id').eq('user_id', user.id).single()
  const { data: org } = membership
    ? await supabase.from('organizations').select().eq('id', membership.org_id).single()
    : { data: null }

  const currentPlan = org?.plan ?? 'starter'

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Abonnement</h1>
      <p className="text-gray-500 mb-8">Plan actuel : <strong>{PLANS[currentPlan as keyof typeof PLANS]?.name}</strong></p>
      <div className="grid grid-cols-2 gap-6">
        {Object.entries(PLANS).map(([key, plan]) => (
          <div key={key} className={`rounded-xl border-2 p-6 ${currentPlan === key ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>
            <h3 className="font-bold text-lg">{plan.name}</h3>
            <p className="text-2xl font-bold mt-2">{plan.price_monthly}€<span className="text-sm font-normal text-gray-500">/mois</span></p>
            <ul className="mt-4 space-y-2 text-sm text-gray-600">
              <li>✓ {plan.limits.prospects_per_month === -1 ? 'Prospects illimités' : `${plan.limits.prospects_per_month} prospects/mois`}</li>
              <li>✓ Moteur de signaux</li>
              <li>{plan.limits.outreach ? '✓' : '✗'} Outreach IA</li>
            </ul>
            {currentPlan !== key && (
              <p className="mt-4 text-xs text-gray-400">Upgrade disponible — contact@charlie.fr</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/stripe/ app/api/webhooks/ app/\(app\)/settings/billing/
git commit -m "feat: add Stripe billing foundation (plans, webhook, billing page)"
```

---

## Résumé Phase 1

À la fin de cette phase, on a :
- ✅ Projet Next.js 15 scaffoldé avec toutes les dépendances
- ✅ Schéma Supabase complet avec RLS multi-tenant
- ✅ Auth (login/signup/callback) avec création automatique d'organisation
- ✅ App shell avec sidebar navigation
- ✅ ICP Builder : langage naturel → Claude Sonnet 4.6 → critères + requêtes LinkedIn
- ✅ API routes sécurisées par session

**Phase suivante :** [2026-05-14-phase2-extension-enrichissement.md] — Extension Chrome MV3 + pipeline d'enrichissement patrimonial (SIRENE, BODACC, DVF, RPPS)
