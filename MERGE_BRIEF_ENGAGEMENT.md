# Brief de merge — `engagement` → `main`

> Document destiné à l'agent (ou au dev) qui prépare la PR finale pour merger
> tout le travail Engagement (couche Associé) vers `main`.
> Branche source : `engagement` (PR à créer vers `main`)
> Travail commité aujourd'hui par Claude Opus sous identité de l'Associé.

---

## 1. Vue d'ensemble

**Objectif** : ouvrir une PR de `engagement` vers `main` qui apporte la **première version utilisable de la couche Engagement** : campagnes LinkedIn multi-étapes, extension Chrome qui exécute les actions, gestion des limites quotidiennes, import CSV de prospects pré-enrichis.

**6 commits ajoutés** par-dessus le travail Intelligence de Mathis :

```
028f926 chore(scripts): CSV prospect importer + failed enrollment reset
0efea8b feat(extension): Chrome extension v2.0 for LinkedIn automation
22b493e feat(outreach): /outreach UI — campaigns table, wizard, edit modal, limits
ed0a9dc feat(outreach): backend API and helpers for LinkedIn campaigns
1d65e3a feat(db): campaigns, LinkedIn sessions, search quota, daily limits
dcbb494 chore: gitignore CSV dumps and built extension zips
```

**Total** : ~5 200 lignes ajoutées, réparties sur 33 nouveaux fichiers + 4 fichiers modifiés (sidebar, page outreach, types, gitignore).

---

## 2. Respect d'OWNERSHIP.md

| Zone touchée | Périmètre | Note |
|---|---|---|
| `app/(app)/outreach/**` | Associé | ✅ Création |
| `app/api/outreach/**` | Associé | ✅ Création |
| `app/api/prospects/for-outreach/` | Associé | ✅ Lecture seule sur `prospection_prospects` |
| `components/outreach/**` | Associé | ✅ Création |
| `components/layout/sidebar.tsx` | Partagé | ⚠️ Ajoute le lien `/outreach` + un `ExtensionWidget`. Pas de suppression côté Mathis |
| `lib/outreach/**` | Associé | ✅ Création |
| `lib/supabase/extension.ts` | Associé | ✅ Création (auth via header `Ext-Key`) |
| `lib/types.ts` | Partagé | ⚠️ Ajoute uniquement les types Engagement (Campaign, CampaignStep, EnrollmentStatus, LinkedInSession, TemplateVariables) à la fin du fichier. **Aucun type Intelligence touché** |
| `extension/**` | Associé | ✅ Création (nouveau dossier) |
| `scripts/import-prospects-csv.ts` | Associé | ✅ Création |
| `scripts/reset-failed-enrollments.sql` | Associé | ✅ Création |
| `supabase/migrations/2026052*.sql` | Associé | ✅ 3 nouvelles migrations |

**Aucun fichier de Mathis n'a été modifié.** Une modification accidentelle de `lib/claude/icp-parser.ts` (changement de modèle Sonnet → Haiku) a été reverée avant les commits — laissée à la décision de Mathis.

---

## 3. Base de données — migrations à signaler

Les 3 migrations suivantes sont **déjà appliquées en prod** (Supabase Cloud `omowryysuqejtmfhwmmf`) via Management API pendant la session de dev :

1. **`20260520000000_campaigns.sql`** — schéma complet : `prospection_campaigns`, `prospection_campaign_steps`, `prospection_campaign_enrollments`, `prospection_linkedin_sessions`, `prospection_extension_link_tokens`
2. **`20260521000000_search_quota_block.sql`** — colonne `search_quota_blocked_until timestamptz` sur `prospection_linkedin_sessions`
3. **`20260522000000_daily_limits.sql`** — colonnes `daily_invitation_limit / daily_dm_limit / daily_check_connection_limit int` sur la même table

**Action pour le merger** : confirmer que ces migrations ne posent pas problème sur les autres environnements. Si Mathis a un dev local Supabase, il devra `supabase db reset` ou `supabase migration up` pour les récupérer.

**Données en prod aujourd'hui** :
- 1 644 prospects CGP importés depuis un CSV Lemlist, enrôlés dans la campagne "CGP · Campagne" (`178d6522-98d7-4100-9e9c-be10d9c3f96f`) en status `profile_search` avec `linkedin_url_resolved` rempli. Le bot peut envoyer les invitations directement sans search.

---

## 4. Variables d'environnement — rien de nouveau

Aucune nouvelle variable d'env. Le bot utilise les variables Supabase existantes (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` pour le scoring de pertinence du profil).

**Note sécurité** : un Supabase Personal Access Token (`sbp_aed323...`) a été partagé par l'utilisateur pendant la session. **Il doit être révoqué** depuis le dashboard Supabase → Account Settings → Access Tokens, avant la PR.

---

## 5. Checks à passer avant merge

```bash
# 1. Récupérer la dernière version
git checkout engagement
git pull origin engagement

# 2. Installer (au cas où — pas de nouvelles deps en théorie)
npm install

# 3. Compiler
npx tsc --noEmit

# 4. Lint
npm run lint

# 5. Tests
npm run test

# 6. Build prod
npm run build
```

Si tout est vert → ouvrir la PR.

---

## 6. Template de PR

**Titre suggéré** : `feat(engagement): LinkedIn campaign engine — bot, UI, scripts (v1)`

**Body suggéré** :

```markdown
## Summary

Première version utilisable de la **couche Engagement** : prospection LinkedIn
multi-étapes pilotée depuis une extension Chrome, gestion des limites
quotidiennes, import de prospects pré-enrichis.

## Ce qui est livré

### Backend
- 3 migrations Supabase (déjà appliquées en prod) : campagnes + sessions
  LinkedIn + quota search + limites quotidiennes
- 13 routes API sous `/api/outreach/` : CRUD campagnes, enrollment,
  limits, endpoints extension (link, jobs, action-result, heartbeat, etc.)
- 1 route lecture `/api/prospects/for-outreach` pour piocher dans le suivi
- Lib `campaign-helpers` (machine d'état) et `message-renderer`
  (interpolation `{{firstName}}` etc.)

### UI `/outreach`
- Page liste de campagnes refondue (cartes arrondies, mini-funnel
  lumineux, tooltips)
- Modal d'édition (Messages + Prospects)
- Modal de limites LinkedIn (invitations / DMs / vérifications par 24h)
- Wizard de création réutilisé pour edit

### Extension Chrome `extension/` (v2.0)
- MV3 service worker + content script LinkedIn + popup
- Détection robuste : 1st relation (header-scoped), Send without a note
  (shadow DOM + fallback texte), 404 (cascade delete), quota mensuel
- Pacing adaptatif : 5-10s (quota), 30-60s (pas d'interaction), 45-120s
  (vraie action LinkedIn)
- Sleeps abortables : pause/déconnexion s'appliquent en <1s même
  pendant un job

### Scripts
- `import-prospects-csv.ts` : import idempotent depuis CSV Lemlist/Apollo
- `reset-failed-enrollments.sql` : remise dans le pipeline des prospects
  abandonnés

## Test plan

- [ ] `npx tsc --noEmit` passe
- [ ] `npm run lint` passe
- [ ] `npm run test` passe
- [ ] `npm run build` passe
- [ ] Page `/outreach` charge avec auth (200), affiche les campagnes
- [ ] Modal "Limites LinkedIn" s'ouvre, sauvegarde une valeur
- [ ] Modal "Modifier" charge la liste des prospects et permet d'en
      retirer un (vérifier que l'enrôlement est supprimé en base)
- [ ] Extension Chrome charge depuis `extension/` (Mode développeur),
      popup affiche v2.0, PIN de liaison fonctionne
- [ ] Job `send_invitation` réussi sur un prospect 2nd/3rd, refuse sur
      un 1st (vérifier les logs `[CS tab:...] Header — connect:...`)

## Périmètre OWNERSHIP

Tous les fichiers nouveaux ou modifiés appartiennent à la couche
Engagement (Associé). Seuls fichiers partagés touchés :
- `lib/types.ts` — ajouts uniquement à la fin (types Campaign etc.)
- `components/layout/sidebar.tsx` — ajout du lien /outreach + widget
- `.gitignore` — exclusion des CSV et zips d'extension

Aucun fichier du périmètre Mathis n'a été modifié.

## Risques connus

- Le quota de recherche LinkedIn est atteint pour le mois (jusqu'au
  1er juin) sur le compte testeur — le bot saute proprement les jobs
  `profile_search` sans pénaliser les enrôlements.
- L'import CSV a un log final cosmétique buggy ("0 enrôlements créés"
  alors qu'ils ont tous été créés) — corrigé dans le commit
  `ed0a9dc` mais à re-tester en condition réelle.
- Pas de tests automatisés sur la nouvelle UI ou l'extension Chrome.

## Stratégie produit liée

- Décision validée : pas de Sales Navigator. La stratégie est une
  grosse base de prospects pré-enrichis (CSV Lemlist, dirigeants,
  avocats, etc.) consommée par le bot via URL directe. Le flow
  `profile_search` est conservé en backup mais cesse d'être critique.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## 7. Commande pour créer la PR

```bash
gh pr create \
  --base main \
  --head engagement \
  --title "feat(engagement): LinkedIn campaign engine — bot, UI, scripts (v1)" \
  --body-file MERGE_BRIEF_ENGAGEMENT.md  # ou colle le template ci-dessus
```

---

## 8. Points de coordination avec Mathis

Avant le merge, vérifier avec lui :

1. **Le changement de modèle dans `lib/claude/icp-parser.ts`** (Sonnet 4.6 → Haiku 4.5) que j'ai reverté — c'était peut-être intentionnel de son côté. Lui demander s'il veut le pousser séparément.
2. **L'usage du champ `prospection_prospects.linkedin_data`** — l'extension le met à jour quand elle capture l'URL via search ; le bot Associé reste dans son périmètre, mais on lit aussi `enrichment_data.dirigeant_prenom` / `dirigeant_nom` qui sont Mathis. Pas d'écriture, juste de la lecture.
3. **Cron `extension/cron`** (endpoint `app/api/outreach/extension/cron/route.ts` si présent) — vérifier qu'il n'entre pas en conflit avec les crons de Mathis.

---

## 9. Après le merge

1. Faire tourner la migration prod si pas déjà fait (déjà appliquée sur omowryysuqejtmfhwmmf — confirmer pour les autres envs).
2. Déployer sur Vercel.
3. Tester `https://charlie-prospection.vercel.app/outreach` en condition réelle (le bot teste déjà sur cette URL).
4. **Révoquer le Supabase Personal Access Token `sbp_aed323...`** (cf §4).
