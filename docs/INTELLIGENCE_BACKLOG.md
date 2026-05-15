# Intelligence Backlog — roadmap couche Intelligence

> Liste vivante des chantiers ouverts sur la couche **Intelligence**
> (Mathis). Strictement scopé à OWNERSHIP.md → côté Mathis. Tout ce qui
> touche outreach / contact / pipeline-stage / campagnes est dans le
> backlog Engagement (associé).
>
> Mise à jour : 2026-05-16. Faire évoluer ce fichier en même temps que
> les PR.

## ⚠️ Principe directeur — person-centric

Tout chantier dans ce backlog doit respecter le principe défini dans
CLAUDE.md §"Personne first, société = moyen" : les CGP cherchent des
**personnes humaines**, les sociétés (principale, SCI, holdings,
autres) sont des **moyens** d'identifier / d'enrichir / de surveiller.

Tout PR qui structure une feature "côté société" plutôt que "côté
personne" doit être justifié explicitement.

## Légende priorité

- 🟢 **Livré, opt-in via feature flag** — code en place, à activer
- 🔴 **Bloquant ou très haute valeur** — à attaquer en premier
- 🟠 **Valeur claire, scope moyen** — quand 🔴 sont consommés
- 🟡 **Polish ou nice-to-have**
- ⚪ **Dette ou défensif** — à faire un jour

---

## 🟢 Livré, en attente d'activation

### 0. Pappers Premium (actes / comptes / publications BODACC enrichies)
**Statut** : code shippé, gated par `PAPPERS_PREMIUM_ENABLED=1`. Activer
dans Vercel quand tu es prêt à dépenser du jeton dessus.

**Ce que ça débloque** : à chaque enrichissement Pappers d'un prospect (même
coût = 1 jeton), on récupère en plus :
- `depots_actes[]` — actes juridiques OCR (cessions de parts, donations,
  modifications capital détaillées) avec tokens de download PDF
- `comptes[]` — bilans annuels complets (PDF + XLSX) par exercice
- `publications_bodacc[]` — annonces BODACC enrichies (dirigeants nommés,
  capital exact, description normalisée)

**Coût** : 1 jeton par appel (vérifié contre `/suivi-jetons` 2026-05-16,
les flags Premium n'augmentent pas le coût). Persisté dans
`enrichment_data.pappers_premium`.

**Monitoring** : `getPappersTokenStatus()` (gratuit) expose les jetons
restants côté Pappers — à brancher dans un widget UI quand on a le temps.

**Prochaine étape (séparée)** : module signal-mining qui parse
`depots_actes` + `publications_bodacc` pour générer des signaux plus riches
que ceux du firehose BODACC brut (un acte "Cession de parts" daté >> un
événement BODACC générique).

**Fichiers** : `lib/data-sources/pappers.ts`, `lib/types.ts`,
`lib/enrichment/enricher.ts`, `docs/QUICKSTART.md` §Pappers Premium.

---

## 🔴 Critique

### 1. Activer INPI RNE (modifs capital + BE)
**Pourquoi** : INPI est la seule source qui remonte les modifications de
bénéficiaires effectifs et de capital — les signaux patrimoniaux les
plus forts pour un CGP. Aujourd'hui le cron `inpi-ingest` est shippé
mais dormant (return `skipped` tant que `INPI_API_TOKEN` + `INPI_API_BASE`
sont absents).

**Effort** : ~30 min à 1h une fois les credentials INPI reçus.

**Steps** :
1. Quand INPI répond à la demande de PAI : récupérer URL + token
2. Ajouter `INPI_API_TOKEN` + `INPI_API_BASE` dans Vercel env vars (prod + preview)
3. Si le format de réponse diffère de `{ formalites: [...] }`, calibrer
   `responseExtractor` dans `lib/data-sources/inpi.ts`
4. Smoke test : `curl -H "Authorization: Bearer $CRON_SECRET" \
   https://charlie-prospection.vercel.app/api/cron/inpi-ingest`
5. Attendre 24h, vérifier la distribution par type_event sur
   `prospection_signals_inbox` filtré `source=inpi`

**Fichiers** : `lib/data-sources/inpi.ts`, `app/api/cron/inpi-ingest/route.ts`

### 2. Sourcer le SIREN sur les signaux BODACC pour réduire les faux positifs
**Pourquoi** : Actuellement les signaux BODACC ont `code_naf=null` (BODACC
ne le publie pas). On contourne via le fallback NULL dans la RPC, mais
ça génère du bruit pour les ICPs avec NAF strict. Solution : enrichir
chaque signal BODACC avec son `code_naf` via un appel Pappers ou Sirene
au moment de l'ingest.

**Effort** : ~2h (mais ATTENTION quota Pappers — abo payant à 500
crédits/MOIS, voir `lib/observability/api-quota.ts`. Enrichir tous les
signaux BODACC via Pappers ferait sauter le mois en quelques jours →
préférer Sirene comme source NAF).

**Trade-off** : alternative moins chère = lookup Sirene par SIREN (déjà
sous quota Sirene, et l'API renvoie le NAF directement).

**Steps** :
1. Étendre `bodacc-ingest` pour, après le fetch, batch-call Sirene
   sur les SIREN extraits → récupérer `activitePrincipaleUniteLegale`
2. Stocker dans `code_naf` du signal
3. Recalibrer les indexes
4. Tests + smoke

**Fichiers** : `app/api/cron/bodacc-ingest/route.ts`, possiblement nouvelle
fonction `getSireneByBatchSiren` dans `lib/data-sources/sirene.ts`

---

## 🟠 Important

### 3. Refresh enrichissement plus malin
**Pourquoi** : Le cron actuel re-enrichit 10 prospects/jour (les plus
anciens). Avec 100 prospects en suivi, chaque fiche est rafraîchie tous
les 10 jours. C'est lent. Améliorations :
- Augmenter le batch quand le quota Pappers le permet
- Déclencher un refresh **immédiat** sur événement (ex. un signal BODACC
  sur un prospect → re-enrichir tout de suite plutôt qu'attendre le tour)
- Detecter les changements significatifs (CA × 2 = patrimoine à recalculer)

**Effort** : ~1h pour le déclenchement par événement, +1h pour la stratégie
adaptive.

### 4. Signal scoring (pas juste détection)
**Pourquoi** : Aujourd'hui un signal est binaire (présent / absent). Or
"modif capital de 5K€" ≠ "modif capital de 5M€". Calculer un poids par
signal selon les data BODACC/INPI.

**Effort** : ~2h. Stocker dans `prospection_signals.valeur_estimee` (déjà
existant, vide aujourd'hui).

### 5. Détection retraite imminente
**Pourquoi** : `signal_priorities.retraite_imminente` est dans les types
mais aucun code ne le détecte. Logique :
- `dirigeant_annee_naissance` + âge ≥ 62 + entreprise > 10 ans = signal
- Croisée avec une absence de successeur identifié (1 seul BE > 80% parts)

**Effort** : ~2h. Logique pure (pas de source externe), juste un scorer.

### 6. Recherche cross-persona ("Tous mes prospects")
**Pourquoi** : Aujourd'hui une recherche = un persona. Si je veux voir
les meilleurs prospects across all my personas (genre "top 50 score >
80 toutes cibles confondues"), pas possible. Cas d'usage typique :
revue hebdo.

**Effort** : ~3h. Nouvelle page `/suivi/top` ou option dans la toolbar.

### 7. Vue "Mes signaux" cross-prospect
**Pourquoi** : La fiche prospect montre les signaux d'**un** prospect.
Vue inverse manquante : "tous les signaux frais aujourd'hui, tous
prospects confondus, ordonnés par poids". Permet de scanner la journée
en 30 secondes.

**Effort** : ~2h. Nouvelle route `/suivi/signaux` ou onglet dans /suivi.

---

## 🟡 Polish

### 8. Filtres /suivi : par CA / patrimoine / dernière activité
**Pourquoi** : Aujourd'hui la liste /suivi est triée par patrimony_score
desc. Pas de filtre. Ajout : range slider CA + range patrimoine + "actif
sur les 30 derniers jours".

**Effort** : 1h.

### 9. Toggle "afficher dpc" dans la fiche signaux
**Pourquoi** : Dépôts des comptes sont filtrés par défaut côté
IntelligenceStrip mais visibles dans la timeline fiche prospect. Toggle
"masquer dpc" pour réduire le bruit visuel.

**Effort** : 30 min.

### 10. Refresh manuel d'une fiche
**Pourquoi** : Bouton "Rafraîchir maintenant" sur la fiche prospect
au lieu d'attendre le cron. Hit `/api/prospects/[id]/refresh` qui
appelle `enrichProspect` ad-hoc.

**Effort** : 1h.

### 11. Recherche LinkedIn intégrée (open in new tab)
**Pourquoi** : Le `linkedin_search_url` ouvre une recherche LinkedIn
générique. Améliorer : enrichir avec plus de critères de matching
(entreprise + ville + role).

**Effort** : 30 min.

### 12. Onboarding visite guidée (premier persona)
**Pourquoi** : Un nouveau user arrive, il voit le hero search mais ne
sait pas qu'il y a 4 tabs derrière. Mini-walkthrough 3 étapes.

**Effort** : 2h. À voir si vraiment utile vs. doc inline.

---

## ⚪ Dette / défensif

### 13. Drop matched_org_ids legacy
**Pourquoi** : Colonne org-wide sur `prospection_signals_inbox`
maintenue par la pass legacy de `match-icps`. Plus jamais lue depuis
qu'on a basculé sur per-prospect. À nettoyer dans 2-4 semaines.

**Effort** : 30 min. Migration `drop column matched_org_ids` + drop
GIN index + drop RPC `append_matched_org_to_signals` + retirer la
pass 1 dans match-icps.

### 14. linkedin_queries column unused
**Pourquoi** : Pappers prompt génère `linkedin_queries` qu'on persiste
mais qu'on ne lit jamais. Soit on l'utilise (recherche LinkedIn
améliorée), soit on l'enlève du parser + de la table.

**Effort** : 30 min pour cleanup, plus si on l'exploite.

### 15. canonicalPersonKey export dead
**Pourquoi** : Fonction exportée seulement utilisée par son propre test
depuis qu'Agent 2 ne s'en sert plus. À internaliser dans `engine.ts`
ou à supprimer.

**Effort** : 5 min.

### 16. Tests d'intégration handler-level
**Pourquoi** : 185 tests unitaires couvrent les helpers purs. Aucun
test au niveau handler (qui appelle Supabase + Claude). Ajouter avec
mock de Supabase client si on veut vraiment fermer la boucle.

**Effort** : 3h+. Pas urgent — les helpers couvrent 95% des bugs réels.

### 17. Observabilité minimum
**Pourquoi** : `timedFetch` log JSON-line mais personne ne les
consulte. Soit on les pousse vers un Logtail/Axiom, soit on retire
le wrapper. Décision à prendre.

**Effort** : 1h pour une intégration Logtail simple, ou 30 min pour
retirer.

### 18. Score patrimoine — cache Claude prompts
**Pourquoi** : Chaque scoring = ~2K tokens de prompt + ~500 de réponse.
Si on rajoute le `cache_control` Anthropic sur la partie statique
(instructions + format), on économise ~30%.

**Effort** : 30 min. Voir doc claude-api.

---

## Pas dans ce backlog (couche Engagement)

Ces items sont **propriété Associé** :
- Génération emails / messages LinkedIn via Claude
- Séquences de relance multi-canal
- Templates de message par persona
- Suivi des réponses (webhook email)
- Gestion campagnes
- A/B testing messages
- Détection unsubscribe

Si l'associé a besoin de plus de signaux ou de plus de données sur un
prospect pour personnaliser son message, c'est une coordination avec
Mathis (Mathis enrichit, Associé exploite).

---

## Workflow d'attaque d'un item

1. Pick un item du backlog (idéalement 🔴 puis 🟠)
2. Crée une feature branch : `git checkout -b intelligence/feat-<slug> intelligence`
3. Code, tests, commits
4. `npm test && npm run lint && npm run build` avant push
5. Push + PR vers `intelligence`
6. Quand stable, PR `intelligence` → `main`
7. Vérifier le déploiement Vercel (`vercel ls charlie-prospection`)
8. Mettre à jour ce fichier : retirer l'item ou le marquer fait
