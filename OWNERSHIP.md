# Ownership — qui code quoi

> Document de référence. Lis-le avant toute modification du code pour
> respecter le périmètre du co-fondateur concerné.

## Les deux périmètres

Le produit Charlie Prospection se découpe en **deux couches strictement
séparées**, chacune appartenant à un co-fondateur :

```
┌─────────────────────────────────────────────────────────────────┐
│  COUCHE INTELLIGENCE  (Mathis)                                  │
│  Trouver, identifier, qualifier, enrichir, surveiller.          │
│  Tout ce qui produit de la connaissance sur un prospect.        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓  (livre des prospects qualifiés
                                  + fiche patrimoniale complète
                                  + signaux frais en continu)
                              │
┌─────────────────────────────────────────────────────────────────┐
│  COUCHE ENGAGEMENT  (Associé)                                   │
│  Contacter, faire avancer dans le pipeline, gérer les          │
│  campagnes. Tout ce qui transforme un prospect en RDV.          │
└─────────────────────────────────────────────────────────────────┘
```

La frontière est nette : **Mathis termine son boulot quand la fiche
patrimoniale est complète et les signaux remontent**. L'associé démarre
le sien à partir de là.

---

## Périmètre Mathis — Couche Intelligence

### Mission
Construire la machine qui trouve les bons prospects, sait absolument
tout sur eux, et détecte en continu les moments d'opportunité.

### Onglets dont Mathis est propriétaire
- `/cible` — définition de personas en langage naturel
- `/recherche` — recherche + enrichissement à la demande
- `/suivi` — liste des prospects validés + leurs fiches patrimoniales + leurs signaux

### Routes UI (`app/(app)/...`)
- `app/(app)/cible/page.tsx`
- `app/(app)/recherche/page.tsx`
- `app/(app)/suivi/page.tsx`

### Routes API (`app/api/...`)
- `app/api/personas/**` — CRUD persona, reparse
- `app/api/recherche/run/**` — recherche non-inserting
- `app/api/suivi/add/**` — ajout au suivi + backfill signaux
- `app/api/suivi/export/**` — export CSV
- `app/api/prospects/[id]/route.ts` — GET / DELETE prospect (read intelligence)
- `app/api/prospects/[id]/signals/**` — timeline signaux per-prospect
- `app/api/cron/**` — TOUS les crons :
  - `sirene-ingest`, `inpi-ingest`, `bodacc-ingest` (firehose ingestion)
  - `match-icps` (matching SIREN per-prospect)
  - `refresh-enrichment` (refresh hebdo des fiches en suivi)

### Composants UI (`components/...`)
- `components/cible/**` — persona-editor, criteria-editor, persona-list, strict-toggle, array-tag-editor, numeric-range-field, cible-page-client
- `components/recherche/**` — recherche-launcher, candidate-list, bulk-add-bar, recherche-page-client
- `components/suivi/**` — suivi-page-client, persona-overview-cards, intelligence-strip-v2, prospect-signals-timeline
- `components/prospects/pipeline-client.tsx` — split-panel de liste (réutilisé par /suivi)
- `components/prospects/pipeline-detail-panel.tsx` — fiche détaillée (tabs Fiche / Signaux **owned Mathis**, tabs Interactions / Pipeline **owned Associé** — voir frontière)
- `components/prospects/prospect-fiche-content.tsx` — corps de la fiche patrimoniale
- `components/prospects/signal-badge.tsx`, `_shared.tsx`
- `components/landing/**` — landing publique commerciale `/`
  (public-header, landing-hero, use-cases-section, blurred-preview,
  loading-overlay, landing-public orchestrateur)

### Libs (`lib/...`)
- `lib/prospect-search/**` — moteur de recherche, NAF mapper, dédup canonique
- `lib/enrichment/**` — enricher, patrimony-scorer (Claude)
- `lib/data-sources/**` — Pappers, Sirene, INPI, BODACC, DVF, RPPS, Annuaire des Entreprises, Doctolib
- `lib/claude/icp-parser.ts` — parsing de persona en français
- `lib/personas/helpers.ts` — merge, deriveName, normaliseProspectCount
- `lib/personas/csv-helpers.ts` — export CSV
- `lib/observability/api-quota.ts` — quota daily Pappers/Sirene/INPI
- `lib/observability/logger.ts` — timedFetch
- `lib/types.ts` — pour les types liés à la couche intelligence
  (ParsedIcpCriteria, StrictFilters, Icp, Prospect.enrichment_data,
  ProspectEnrichmentData, SearchCandidate, SignalsInboxRow,
  InboxEventType, InboxSource, BodaccEvent, RppsData, FinanceYear,
  BeneficiaireEffectif, ContexteMarcheImmoLocal, PotentielRppsNiveau,
  PatrimonyScoreResult, PatrimonyScoreBreakdown)

### Tables DB dont Mathis est propriétaire
- `prospection_icps` — personas
- `prospection_signals_inbox` — firehose global (no RLS)
- `prospection_signals` — signaux per-prospect (Mathis écrit, Associé peut lire)
- `prospection_api_quota` — quota daily protection
- `prospection_persons_cache` — cache global cross-org, service role uniquement (lecture + écriture depuis `/api/recherche/run` et le cron `refresh-persons-cache`)
- **`prospection_prospects`** — écriture lors de l'ajout au suivi
  (insert via /api/suivi/add), Mathis met à jour `enrichment_data`,
  `patrimony_score`, `icp_score`, `last_signal_at`. Le champ
  `crm_stage` et `linkedin_data.niveau_patrimonial` sont initialisés
  ici mais Associé les fait évoluer (voir frontière).

### Migrations DB dont Mathis est responsable
- `20260514000000_initial.sql` (partiel — la moitié intelligence)
- `20260515000000_signals_inbox.sql`
- `20260515120000_signals_match_null_naf.sql`
- `20260516000000_personas.sql`
- `20260516010000_signal_per_prospect.sql`
- `20260518000000_api_quota.sql`

### Variables d'environnement
- `PAPPERS_API_KEY`, `PAPPERS_DAILY_LIMIT`
- `INSEE_SIRENE_API_KEY`, `SIRENE_DAILY_LIMIT`
- `INPI_API_TOKEN`, `INPI_API_BASE`, `INPI_DAILY_LIMIT`
- `BODACC_DAILY_LIMIT`
- `ANTHROPIC_API_KEY` (parser persona + scoring patrimoine)
- `CRON_SECRET`

---

## Périmètre Associé — Couche Engagement

### Mission
Construire la machine qui transforme un prospect qualifié en RDV : génération
de messages personnalisés, séquences multi-canal, gestion du pipeline de
contact, suivi des réponses.

### Onglets dont l'associé est propriétaire
- **`/outreach`** (actuellement stub, retiré de la sidebar — à reconstruire)
- Toute extension future du `/suivi` qui touche **la progression de contact**
  (vs. la fiche patrimoniale qui reste Mathis)

### Routes UI (`app/(app)/...`)
- `app/(app)/outreach/**` — pages de campagne, drafts, séquences

### Routes API à construire (`app/api/...`)
- `app/api/outreach/**` — générer un email/LinkedIn, lister les drafts,
  marquer envoyé, suivre les réponses
- `app/api/prospects/[id]/route.ts` (PATCH) — déjà existant, **partagé** :
  Associé met à jour `crm_stage` quand il déplace le prospect dans le
  pipeline (to_contact → contacted → meeting → client / lost)
- `app/api/prospects/[id]/activity/**` — log d'interactions (notes, calls,
  emails, LinkedIn, meetings) → **propriété Associé** (Mathis a posé la
  table + le tab pour amorcer, mais le sujet est l'engagement)

### Composants UI (`components/...`)
- À créer : `components/outreach/**` — composer, sequence-builder,
  campaign-list, reply-tracker
- `components/suivi/prospect-activity-log.tsx` — tab "Interactions" sur la
  fiche prospect (déjà posé par Mathis, **maintenance Associé**)
- `components/prospects/pipeline-detail-panel.tsx` — les tabs "Interactions"
  et "Pipeline" sont **owned Associé** ; les tabs "Fiche" et "Signaux"
  restent owned Mathis

### Libs (`lib/...`)
- À créer : `lib/outreach/**` — generators, templates, sequence-engine
- `lib/claude/outreach-generator.ts` — à créer (génération messages via
  Claude depuis fiche + signaux)
- `lib/types.ts` — partie engagement : OutreachMessage, OutreachChannel,
  OutreachStatus, ActivityKind, ProspectActivity, CrmStage

### Tables DB dont l'associé est propriétaire
- **`prospection_outreach_messages`** — drafts + envois (déjà en schema,
  encore inutilisée)
- **`prospection_prospect_activity`** — log d'interactions (notes / calls
  / emails / LinkedIn / meetings)
- **`prospection_prospects`** — lecture (vue prospect) + écriture sur
  champs d'engagement uniquement : `crm_stage`, `linkedin_data` (la
  partie qui relève du contact), pas `enrichment_data` ni
  `patrimony_score` (intelligence Mathis)

### Migrations DB dont l'associé est responsable
- `20260514000000_initial.sql` (partiel — la moitié engagement :
  prospection_outreach_messages)
- `20260517000000_prospect_activity.sql`
- À venir : tables séquences / templates / réponses LinkedIn / etc.

### Variables d'environnement
- Toute clé email (Postmark / Resend / SendGrid)
- Tout token LinkedIn ou outil de scraping de profils
- Tout webhook de réponse email

---

## Frontière — qui touche quoi

| Élément | Read | Write |
|---|---|---|
| `prospection_prospects.enrichment_data` | Les deux | **Mathis** |
| `prospection_prospects.patrimony_score`, `icp_score` | Les deux | **Mathis** |
| `prospection_prospects.last_signal_at` | Les deux | **Mathis** (via cron match-icps) |
| `prospection_prospects.crm_stage` | Les deux | **Associé** (sauf init à 'to_contact' par /suivi/add — Mathis) |
| `prospection_prospects.linkedin_url`, `linkedin_data` | Les deux | **Mathis** init, **Associé** maj (niveau patrimonial reste Mathis dans linkedin_data) |
| `prospection_signals` | Les deux | **Mathis** (via cron) |
| `prospection_signals_inbox` | **Mathis** uniquement | **Mathis** uniquement (firehose) |
| `prospection_outreach_messages` | **Associé** uniquement | **Associé** uniquement |
| `prospection_prospect_activity` | Les deux (Mathis : pour stats overview) | **Associé** principalement |
| `prospection_icps` | **Mathis** uniquement | **Mathis** uniquement |

### Composants partagés
- `components/prospects/pipeline-detail-panel.tsx` héberge **les 4 tabs** :
  - Tab "Fiche" → Mathis
  - Tab "Signaux" → Mathis
  - Tab "Interactions" → Associé
  - Tab "Pipeline" (timeline CRM stage) → Associé
  Quand l'un de nous touche un tab, ne pas toucher les autres sans accord.

### Le bouton "Retirer du suivi"
- C'est Mathis qui décide qu'un prospect sort du suivi (= il n'est plus
  intéressant à enrichir/surveiller). La cascade supprime aussi les
  messages outreach et les interactions → coordonner si Associé est
  en train de travailler dessus.

---

## Stratégie de branches Git

Trois branches **long-lived** :

```
main             Source de vérité, déployée en production sur Vercel.
                  Aucun push direct. Tout passe par PR.

intelligence     Branche de travail de Mathis.
                  Toutes les évolutions de la couche Intelligence
                  partent d'ici. PR vers main quand stable.

engagement       Branche de travail de l'associé.
                  Toutes les évolutions de la couche Engagement
                  partent d'ici. PR vers main quand stable.
```

### Workflow type — Mathis (Intelligence)

```bash
# Synchroniser sa branche avec main
git checkout intelligence
git pull origin intelligence
git merge origin/main  # ou rebase si propre

# Travail sur une feature
git checkout -b intelligence/feat-pappers-modif-cron intelligence
# … code …
git push origin intelligence/feat-pappers-modif-cron

# Sur GitHub : PR de la feature branch → intelligence
# Une fois validée → merge dans intelligence
# Quand la couche est stable → PR intelligence → main
```

### Workflow type — Associé (Engagement)

```bash
git checkout engagement
git pull origin engagement
git merge origin/main

git checkout -b engagement/feat-outreach-generator engagement
# … code …
git push origin engagement/feat-outreach-generator

# PR de la feature branch → engagement
# Quand la couche est stable → PR engagement → main
```

### Règles
- **Jamais de push direct sur `main`.** Toujours via PR (depuis
  `intelligence` ou `engagement`).
- **Jamais de cross-branch direct.** Si tu touches un fichier qui
  appartient à l'autre couche, c'est qu'il faut probablement passer
  par `main` (synchro), pas par l'autre branche.
- Les feature branches courtes peuvent partir de `intelligence` ou
  `engagement` directement (nommage suggéré : `intelligence/feat-…`
  ou `engagement/feat-…`).
- `main` reste **toujours déployable**. Les merges vers `main` doivent
  être verts (tsc + tests + lint + build).
- Les migrations Supabase appliquées en prod doivent être présentes sur
  `main` AVANT le merge du code qui les utilise (pour éviter une fenêtre
  où le code shippé attend une migration absente).

### En cas de conflit sur un fichier partagé
`pipeline-detail-panel.tsx`, `lib/types.ts`, et `prospection_prospects`
sont les zones de friction probable. Quand un conflit survient :
1. Vérifier OWNERSHIP.md pour confirmer qui possède quelle partie
2. Coordonner via Slack/Linear (ou tout autre canal) avant de résoudre
3. Documenter la résolution dans le commit de merge

## Règles de coordination

### Avant de modifier
1. Lire OWNERSHIP.md (ce fichier)
2. Si le fichier touche le périmètre de l'autre : ping avant la PR
3. Si un nouveau fichier ou route doit appartenir à un périmètre, ajouter
   la mention dans ce document **dans la même PR**

### Pour ajouter un nouveau dossier/route
- `/cible/*`, `/recherche/*`, `/suivi/*` → Mathis par défaut
- `/outreach/*`, `/campagne/*`, `/inbox/*` (mail) → Associé par défaut
- Si ambigu (ex. `/relances`) → ajouter à OWNERSHIP.md d'abord, code après

### Migrations DB
- Tout ajout de table → ajouter ici qui est propriétaire (read/write)
- Tout ajout de colonne sur une table partagée → ping l'autre

### Variables d'environnement
- Chaque variable a un seul propriétaire (celui qui l'utilise en code)
- Si une variable est partagée, mentionner les deux noms dans OWNERSHIP.md

---

## Pourquoi cette séparation

Charlie design la phase **discovery + qualification** (avant la relation client) — c'est l'angle qui distingue le produit dans le marché CGP français. La couche Intelligence est ce que personne d'autre ne fait. La couche Engagement, c'est ce que tout le monde fait, mais bien intégré derrière la qualification, c'est ce qui ferme la boucle.

Les deux couches doivent rester **modulaires et indépendantes** :
- L'Intelligence peut tourner sans Engagement (cas : un CGP qui utilise Charlie comme une base de donnée d'intelligence et fait son outreach ailleurs)
- L'Engagement peut prendre des prospects d'ailleurs (cas : import manuel d'une liste tierce dans /suivi, puis campagnes via l'Engagement)

D'où l'API claire entre les deux : tout passe par `prospection_prospects` comme contrat. Mathis écrit l'intelligence dans `enrichment_data`/`patrimony_score`, Associé lit ça pour personnaliser ses messages.
