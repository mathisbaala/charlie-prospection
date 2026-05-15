# Landing publique commerciale `/`

**Date** : 2026-05-15
**Owner** : Mathis (Intelligence layer — touche `/`, `/api/personas`, `/recherche`)
**Statut** : Spec validé, prêt pour plan d'implémentation

## Problème

Aujourd'hui `/` est une page interne gated par auth : visiteur non connecté → redirect `/login`. Le hero "Qui cherchez-vous ?" n'est visible qu'aux users déjà connectés sans prospect.

On veut transformer `/` en **landing publique commerciale** qui :
1. Convertit les visiteurs anonymes via une démo immédiate (champ libre → animation → preview floutée → signup)
2. Laisse passer les users déjà connectés directement vers leur dashboard `/suivi`
3. Offre un point d'entrée visible "Connexion" pour les clients existants

## Décisions structurantes

| Décision | Choix retenu | Raison |
|---|---|---|
| Routage `/` connecté | Redirect direct vers `/suivi` | Si déjà client, pas besoin de revoir l'argumentaire commercial |
| Header public | Logo gauche + "Connexion" seul à droite | Force tout le monde à voir la démo via le hero ; plus radical, plus aligné sur le teaser |
| Sous le pli | 1 section "3 cas d'usage cliquables" | Donne envie d'essayer ; plus engageant que des logos de sources data |
| Conversion | Animation actuelle + preview floutée + paywall | Conversion-driven sans appel Claude par visiteur anonyme |
| Persistance description | sessionStorage | Évite URL longue, pas de fuite par referrer, pas de modif API |

## Logique de routage `/`

```
GET /
├── User non connecté → afficher LandingPublic
├── User connecté sans org → redirect /cible (onboarding existant)
└── User connecté avec org → redirect /suivi
```

**Conséquence** : un user connecté ne reverra plus jamais `/`. Pour recréer une cible, il passe par `/cible` (déjà existant).

## Composants

### Header public (nouveau)

```
┌──────────────────────────────────────────────────────┐
│  ● Charlie · Prospection                  Connexion  │
└──────────────────────────────────────────────────────┘
```

- Gauche : identique à l'actuel (puce copper + "Charlie · Prospection")
- Droite : un seul lien texte "Connexion" → `/login`
- Pas de bouton "Créer un compte" — le seul chemin signup passe par la démo

### Hero (modifs minimes)

Conserve le composant actuel `HeroSearch` à 90%. Modifs :

- Sous-titre : `"Décrivez votre prospect idéal."` (drop "en langage naturel")
- Label bouton : `"Lancer la recherche"` (au lieu de "Créer la cible" — moins jargon)
- Comportement submit : **toujours** anonyme dans ce contexte (le routage garantit que les users connectés sont redirigés hors de `/` avant d'atteindre la page). Submit déclenche : animation → reveal cartes blurées → paywall. Pas d'appel `/api/personas` depuis ce contexte.

Note : le composant `HeroSearch` actuel sera donc allégé — la logique de fetch `/api/personas` est retirée et déplacée vers `/cible` (où elle existe déjà). On peut soit refactor `HeroSearch` pour ne garder que le visuel et déléguer le submit via prop callback, soit créer un `LandingHero` dédié et laisser l'existant intact pour `/cible`. Décision d'implémentation : voir le plan.

### Section "Cas d'usage" (nouveau, sous le pli)

```
EXEMPLES DE CIBLES
Quelques prospects que Charlie identifie aujourd'hui.

┌──────────────────┬──────────────────┬──────────────────┐
│ Score 87         │ Score 73         │ Score 91         │
│                  │                  │                  │
│ Chirurgiens      │ Vendeurs récents │ Dirigeants PME   │
│ proches de la    │ BODACC           │ 50+ ans          │
│ retraite         │                  │                  │
│                  │ Cession de       │ NAF industrie,   │
│ NAF santé, 55+,  │ société,         │ ETI familiales,  │
│ Île-de-France    │ liquidités       │ transmission     │
│                  │ disponibles      │                  │
│ Voir un exemple →│ Voir un exemple →│ Voir un exemple →│
└──────────────────┴──────────────────┴──────────────────┘
```

- 3 cartes alignées en row, stack vertical en mobile
- Style identique aux cartes prospect du `/suivi` : surface + bordure 1px + border-left 2px copper
- Score patrimoine en haut à gauche en Geist Mono tabular
- Titre Fraunces, description Plus Jakarta muted
- Hover : fond `var(--color-accent-dim)` léger, pas de transform
- **Click** : pré-remplit le champ du hero avec la description correspondante + scrolle vers le haut (smooth scroll). Pas de submit auto.

Eyebrow `EXEMPLES DE CIBLES` : uppercase 11px, tracking 0.08em, copper. Titre h2 Fraunces.

### Animation + paywall (le moment conversion)

Pour visiteur **anonyme** uniquement (un user connecté ne peut pas atteindre cet écran à cause du routage `/` qui le redirige vers `/suivi`).

**Phase 1 — Animation (~6s)** : réutilise `LoadingOverlay` actuel avec ses 4 phases (zéro modif).

**Phase 2 — Reveal cartes blurées (transition)** :
- L'overlay disparaît
- Le hero se replie en haut (titre + sous-titre disparaissent, ne reste que la query parsée affichée en chips read-only ex: `Chirurgiens · Lyon · 55+ ans`)
- 4 cartes prospect blurées apparaissent en stagger (50ms entre chaque)

Structure d'une carte blurée :
```
┌──────────────────────────────────────────────────┐
│ Score 87  ████████████ ▓▓▓▓                      │  ← nom flouté blur(6px)
│           Lyon 6e · NAF 8622A                    │  ← visible
│           ████████████  ████ ████ ████          │  ← détails entreprise floutés
│                                                   │
│           [VENTE BODACC] [PATRIMOINE 4.2M]       │  ← badges signaux visibles
└──────────────────────────────────────────────────┘
```

Visible (vrai-plausible) :
- Score patrimoine (variétés 65-95)
- Ville cohérente avec la query
- Code NAF cohérent
- Badges signaux (BODACC / Patrimoine)

Floué (`filter: blur(6px)`) :
- Nom complet du prospect
- Adresse précise
- Détails entreprise

Génération : `seedrandom(query)` produit 4 cartes plausibles cohérentes mais 100% fake. Aucun appel à la base, aucun coût Claude. Détermine que la même query donne toujours les mêmes 4 cartes (cohérence si l'utilisateur revient).

**Pas de mention "aperçu illustratif"** — choix retenu pour garder l'impact.

**Phase 3 — Paywall sticky bottom** :
```
┌──────────────────────────────────────────────────────────┐
│  142 prospects identifiés en Gironde.                    │
│  Créez votre compte pour les découvrir.   [ Commencer ] │
└──────────────────────────────────────────────────────────┘
```

- Compteur déterministe : `(hash(query) % 200) + 50` → varie selon la requête (87, 142, 234…) mais cohérent pour la même query
- Bouton "Commencer" → stocke description en sessionStorage → redirect `/signup`

## Flux conversion (description → signup → persona)

```
1. Visiteur tape "Chirurgiens lyonnais proches de la retraite"
2. Click "Lancer la recherche" (visiteur anonyme uniquement — connectés sont redirigés hors de `/`)
   ├── Animation 6s
   ├── Reveal 4 cartes blurées
   └── Paywall sticky

3. Click "Commencer" sur le paywall
   → sessionStorage.setItem('charlie_pending_desc', description)
   → router.push('/signup')

4. /signup (formulaire actuel : nom cabinet + email + password)
   → POST /api/auth/signup (inchangé)
   → signInWithPassword (inchangé)
   → APRÈS signin réussi : check sessionStorage.getItem('charlie_pending_desc')
       ├── Présent : POST /api/personas { description }
       │           → sessionStorage.removeItem('charlie_pending_desc')
       │           → router.push(`/recherche?persona=${id}`)
       └── Absent : router.push('/pipeline')  (comportement actuel)

5. Edge case : visiteur clique "Connexion" au lieu de signup
   → /login fait le même check post-auth
   → User existant + desc en attente → création persona + /recherche
   → User existant + pas de desc → /suivi (comportement actuel)
```

### Helper partagé

Nouveau fichier `lib/pending-description.ts` :

```ts
const KEY = 'charlie_pending_desc'

export function storePendingDescription(desc: string): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(KEY, desc)
}

export function consumePendingDescription(): string | null {
  if (typeof window === 'undefined') return null
  const desc = sessionStorage.getItem(KEY)
  if (desc) sessionStorage.removeItem(KEY)
  return desc
}
```

## Edge cases

| Cas | Comportement |
|---|---|
| Onglet fermé entre paywall et signup | sessionStorage perdu, visiteur retape ou repart du hero |
| Echec signup (email pris) | Description reste en storage, visiteur peut tenter login depuis la page signup |
| User connecté arrive sur `/?desc=...` (URL share) | Redirect `/suivi`, on ignore le param (conscient — share d'URL ≠ priorité v1) |
| Création persona échoue après signup | On log l'erreur, on tombe sur `/pipeline` plutôt que de bloquer le user |
| Query vide ou < 5 chars | Bouton submit reste disabled (comportement actuel inchangé) |

## Conformité DESIGN.md

- Background `#F3EFE6` (parchment) partout — jamais `bg-white`
- Accent `#BC6B2A` (copper) pour CTA, hover, badges
- Fraunces pour titres + wordmark
- Plus Jakarta Sans pour body et boutons
- Geist Mono + tabular-nums pour scores et compteur
- Border-radius max 2px sur tout (cartes, boutons, champ)
- Pas de `rounded-xl/2xl/full` sur les cartes
- Patrimony score affiché AVANT le nom (chiffre puis label flouté)

## Fichiers touchés

| Fichier | Action |
|---|---|
| `app/page.tsx` | Refactor : retirer le redirect `/login` pour anonymes, afficher la nouvelle landing |
| `components/search/hero-search.tsx` | Modifier : sous-titre, label bouton, branche submit auth/anonyme |
| `components/landing/public-header.tsx` | Nouveau : header avec lien "Connexion" |
| `components/landing/use-cases-section.tsx` | Nouveau : 3 cartes cas d'usage cliquables |
| `components/landing/blurred-preview.tsx` | Nouveau : 4 cartes floutées + paywall sticky |
| `components/landing/landing-public.tsx` | Nouveau : compose header + hero + use-cases + gestion phase reveal |
| `lib/pending-description.ts` | Nouveau : helper sessionStorage |
| `lib/preview-generator.ts` | Nouveau : `seedrandom(query)` → 4 cartes plausibles + compteur |
| `app/(auth)/signup/page.tsx` | Modifier : check `consumePendingDescription` post-signin |
| `app/(auth)/login/page.tsx` | Modifier : check `consumePendingDescription` post-signin |

## Hors scope (v1)

- SEO : pas de meta tags optimisés ni de schema.org dans cette première version (à faire en v2 si on veut acquérir via search)
- A/B test du compteur ou des cartes
- Logos clients / témoignages
- Pricing visible publiquement
- FAQ
- Footer marketing
- Animation des cartes blurées (genre "scan en cours")
- Dark mode (déjà absent du reste de l'app)

## Mesure du succès

Métriques à observer post-mise en prod (analytics non couvertes par ce spec, mais à brancher en v1.1) :
- Taux de visiteurs `/` qui tapent une query (engagement)
- Taux de visiteurs qui voient le paywall et cliquent "Commencer" (conversion intent)
- Taux de "Commencer" → signup complété (conversion finale)
- Taux d'abandon entre signup et `/recherche` (friction post-signup)
