# Quickstart — Charlie Prospection (Intelligence layer)

> Lis-moi avant de commencer une journée de code. ~3 min.

## 1. Branche de travail

```bash
git checkout intelligence
git pull origin intelligence
```

Toujours partir de `intelligence`. Quand `main` reçoit un merge de
`engagement`, synchroniser :

```bash
git checkout intelligence
git pull origin main          # ramener les derniers changements main
git push origin intelligence  # publier
```

## 2. Dev server local

```bash
npm install                   # une fois suffit, puis quand package.json change
npm run dev                   # http://localhost:3000
```

Aucun setup Supabase local nécessaire — les `NEXT_PUBLIC_SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` dans `.env.local` pointent vers la prod
Supabase. Toute donnée écrite en dev modifie la prod — fait attention
(préférer des persona/prospect de test isolés).

## 3. Boucle de dev quotidienne

```bash
# Avant chaque session
git pull origin intelligence

# Pendant le code
npm run dev          # hot reload
npm test -- --watch  # tests qui re-runnent à chaque save

# Avant de commiter (gates obligatoires)
npx tsc --noEmit     # type-check
npm test             # 185 tests doivent passer
npm run lint         # 0 error
npm run build        # build prod OK (dernière étape)
```

## 4. Schéma de commit

Conventional commits — préfixes utilisés sur main :

- `feat(domain): ...` — nouvelle fonctionnalité
- `fix(domain): ...` — bug fix
- `chore(domain): ...` — nettoyage, deps, config
- `docs: ...` — documentation
- `style(domain): ...` — visual / lint
- `test(domain): ...` — ajout/fix de tests
- `refactor(domain): ...` — restructuration sans changement de comportement

Domain = `cible / recherche / suivi / signals / search / cron / persona / ...`

## 5. Workflow PR vers main

```bash
git checkout -b intelligence/feat-quelque-chose intelligence
# … code, commits …
git push -u origin intelligence/feat-quelque-chose

# Sur GitHub : créer une PR vers `intelligence` (intégration owner-side)
# Une fois validée, merge dans intelligence

# Quand la couche est stable et qu'on veut la promouvoir en prod :
# Sur GitHub : créer une PR de `intelligence` vers `main`
# Le merge déclenche le deploy Vercel automatique
```

Variante plus courte si tu veux skipper la feature branch :

```bash
git checkout intelligence
# … code …
git commit -am "feat(suivi): ..."
git push origin intelligence

# Puis PR intelligence → main quand prêt
```

## 6. Appliquer une migration Supabase

Toute modification de schéma vit dans `supabase/migrations/`. Format
imposé : `YYYYMMDDHHMMSS_description.sql`.

```bash
# Génère ton fichier de migration
touch supabase/migrations/20260520000000_ma_nouvelle_table.sql

# … écris le SQL …

# Tests locaux + commit
npm test
git commit -am "feat(db): ma_nouvelle_table"
git push origin intelligence

# Application en prod (nécessite un token Supabase jetable)
SUPABASE_ACCESS_TOKEN=sbp_xxx supabase db push
```

**RÈGLE** : la migration doit être appliquée en prod **avant** le merge
sur main (sinon le code shippé attend une table inexistante).

## 7. Déclencher un cron manuellement

```bash
CS=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)

# Refresh enrichissement (10 prospects en suivi)
curl -H "Authorization: Bearer $CS" \
  https://charlie-prospection.vercel.app/api/cron/refresh-enrichment

# Sirene firehose
curl -H "Authorization: Bearer $CS" \
  https://charlie-prospection.vercel.app/api/cron/sirene-ingest

# BODACC firehose
curl -H "Authorization: Bearer $CS" \
  https://charlie-prospection.vercel.app/api/cron/bodacc-ingest

# Matching SIREN per-prospect
curl -H "Authorization: Bearer $CS" \
  https://charlie-prospection.vercel.app/api/cron/match-icps
```

Les 5 crons tournent automatiquement chaque jour, mais c'est utile de
les déclencher manuellement après une nouvelle migration ou un fix
de classifier.

## 8. Vars d'env (Intelligence layer)

| Variable | Rôle | Où |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | .env.local + Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth client | .env.local + Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (server) | .env.local + Vercel |
| `ANTHROPIC_API_KEY` | Claude pour parser + scoring | .env.local + Vercel |
| `PAPPERS_API_KEY` | Pappers v2 (plan payant 500/mois) | .env.local + Vercel |
| `PAPPERS_MONTHLY_LIMIT` | Cap mensuel Pappers (défaut 500 — match l'abo) | Vercel (optional) |
| `PAPPERS_PREMIUM_ENABLED` | `1` pour activer Premium (actes/comptes/BODACC enrichis, cf §Premium) | Vercel (optional) |
| `INSEE_SIRENE_API_KEY` | INSEE Sirene v3.11 | .env.local + Vercel |
| `SIRENE_DAILY_LIMIT` | Cap quota quotidien (défaut 1000) | Vercel (optional) |
| `INPI_API_TOKEN`, `INPI_API_BASE` | INPI RNE (en attente activation) | Vercel |
| `INPI_DAILY_LIMIT` | Cap quota quotidien (défaut 500) | Vercel (optional) |
| `BODACC_DAILY_LIMIT` | Cap quota quotidien (défaut 5000) | Vercel (optional) |
| `CRON_SECRET` | Bearer pour les 5 crons | .env.local + Vercel |
| `QUOTA_DISABLED` | Bypass quota (debug only) | .env.local rarement |

## 9. Comprendre ce qui tourne sans rien faire

| Cron | Schedule UTC | Action |
|---|---|---|
| `sirene-ingest` | 05:30 | ~1390 créations Sirene → signals_inbox |
| `inpi-ingest` | 05:45 | INPI RNE diff (skipped tant que token absent) |
| `bodacc-ingest` | 06:00 | ~1000 annonces BODACC → signals_inbox |
| `match-icps` | 06:30 | Match SIREN per-prospect → signals + matched_org_ids |
| `refresh-enrichment` | 04:00 | Re-run enrichProspect sur 10 prospects > 7j |

## Pappers Premium (actes / comptes / BODACC enrichis)

Le plan Pappers payant (500 jetons/mois) débloque 3 dimensions Premium
récupérables en activant des query flags sur `/entreprise`. **Coût = 1 jeton
par appel** quels que soient les flags activés — les flags n'augmentent pas
le coût, ils ajoutent juste des champs à la réponse.

Pour activer :
1. Poser `PAPPERS_PREMIUM_ENABLED=1` dans Vercel env vars (prod + preview)
2. Redéployer
3. Vérifier `select enrichment_data->'pappers_premium' from prospection_prospects
   where enrichment_data ? 'pappers_premium' limit 5;` après la prochaine
   passe `refresh-enrichment` ou un nouvel ajout au /suivi

Ce qu'on récupère :

| Dimension | Champ | Utilité |
|---|---|---|
| **Actes juridiques OCR** | `depots_actes[]` | Cessions de parts datées, donations, modifications de capital détaillées — signaux patrimoniaux les plus forts (un acte est >> qu'un événement BODACC brut) |
| **Comptes annuels** | `comptes[]` | Bilans PDF + XLSX par exercice avec tokens de download |
| **BODACC enrichies** | `publications_bodacc[]` | Annonces avec dirigeants nommés, capital exact, description normalisée |

**Monitoring du quota** : `lib/data-sources/pappers.ts → getPappersTokenStatus()`
appelle `/suivi-jetons` (gratuit, ne consomme pas de jeton) et retourne
`{ jetons_abonnement, jetons_abonnement_utilises, remaining }`. À brancher
dans un endpoint admin ou un widget de jauge dans l'UI.

**Garde-fou** : si tu actives `premium: true` dans le code sans poser l'env
var, le wrapper log un warn et bascule en mode standard (pas d'abus
accidentel).

## Aide-mémoire

- `OWNERSHIP.md` — qui touche quoi (consulter avant de modifier un fichier partagé)
- `DESIGN.md` — design system, anti-patterns, palette, typo
- `CLAUDE.md` — instructions pour Claude Code si tu l'utilises
- `AGENTS.md` — pour les agents IA
- `docs/INTELLIGENCE_BACKLOG.md` — roadmap prioritisée Intelligence
- `docs/QUICKSTART.md` — ce fichier
