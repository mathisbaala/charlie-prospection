# Data Strategy — Cast wide, then dig deep

Principe directeur pour décider **où** dans le parcours utilisateur déclencher
quelle collecte de données. À appliquer à toute nouvelle source, tout nouveau
champ d'enrichissement, toute décision de fetch.

## Le principe en une phrase

> Plus un prospect avance dans le funnel, plus on peut se permettre de
> dépenser de ressources sur lui — parce qu'il a démontré sa valeur en
> passant l'étape précédente.

## Le funnel à 3 étapes

```
  RECHERCHE              SUIVI                OUTREACH
  ─────────              ─────                ────────
  breadth max            depth max            engagement max
                                              (réservé associé)
  50 candidats           1 prospect           1 prospect
  enrichissement         enrichissement       contact actif
  standard               approfondi
  → moyenne effort       → effort + temps     → effort + humain
  → vue d'ensemble       → fiche complète     → personnalisation
```

À chaque étape l'effort par prospect augmente, et le nombre de prospects
concernés diminue. Le produit du nombre × l'effort reste à peu près constant
côté budget — c'est ce qui rend ce funnel viable économiquement.

## Pourquoi ce pattern

### Côté utilisateur

- **À la recherche**, le CGP *scanne* rapidement — il a besoin de comparer
  20-50 candidats pour repérer les pépites. Trop d'info par candidat = il se
  noie. Pas assez = il ne peut pas trier.
- **Au suivi**, le CGP *étudie* un prospect avant de l'aborder. Là il veut
  tout savoir : historique BODACC complet, comptes annuels sur plusieurs
  années, signaux sur toutes les sociétés du dirigeant.
- **À l'outreach**, le CGP *converse* — il a besoin d'arguments précis et
  d'angles d'attaque taillés sur mesure pour cette personne.

### Côté coûts

- Pappers : 500 jetons/mois. Si on fait du Pappers approfondi sur les 50
  candidats de chaque recherche, on consomme tout en 6 recherches. Si on
  fait standard + on creuse seulement les ~5 sélectionnés au /suivi/add,
  on consomme moins ET on extrait plus de valeur sur les bons candidats.
- BODACC / DVF / Annuaire-Entreprises / Infogreffe : gratuits, donc on peut
  pousser la profondeur sans plafond budget — c'est juste du temps CPU.
- Claude (scoring patrimonial) : coût marginal. À déclencher où le scoring
  est consommé (= aux 3 étapes).

## Implémentation actuelle

| Étape | Endpoint | Pappers | BODACC | DVF | INPI | Notes |
|---|---|---|---|---|---|---|
| Recherche | `/api/recherche/run` | Premium 1× (50 cand) | 10 events/SIREN | zone + adresse-siège | (token pending) | 50 candidats default |
| Suivi add | `/api/suivi/add` | — (réutilise) | **50 events/SIREN × tout le portefeuille** | — (réutilise) | (à brancher) | + Premium signal mining + 1y inbox backfill |
| Refresh | `/api/cron/refresh-enrichment` | Premium 1× | 10 events | zone + adresse | (token pending) | Cible 2×/mois, paused MVP |
| Outreach | `/api/outreach/*` | — | — | — | — | À reconstruire (associé) |

## Règles concrètes pour toute nouvelle source

Quand tu ajoutes une source de données (ex: INPI quand le token arrive, news
search, BBF, etc.), pose-toi ces questions dans l'ordre :

### 1. Quel est son coût par appel ?
- Gratuit (opendata) → peut aller au `/recherche/run` ET au `/suivi/add`
- Payant à l'appel → réserver au `/suivi/add` sauf si breadth absolue justifiée
- Payant + lent (>2s) → réserver au `/suivi/add` ou à un cron asynchrone

### 2. Qui consomme le résultat ?
- Affiché dans la liste de candidats `/recherche` → doit tourner au search
- Affiché dans la fiche d'un prospect en suivi → peut attendre `/suivi/add`
- Utilisé pour le scoring de tri → doit tourner au search
- Utilisé pour la rédaction de l'outreach → réserver à `/outreach`

### 3. Combien de prospects affectés ?
- 50 (breadth recherche) → coût × 50 par lancement, attention au quota
- 1-5 (depth suivi) → coût × N, beaucoup plus tolérable
- Le portefeuille complet en cron → coût × M, calibrer le `BATCH_SIZE`

### 4. Quelle est sa fraîcheur cible ?
- Données stables (capital social, NAF, BE) → fetch 1× au /recherche puis
  refresh 2×/mois suffit
- Données vivantes (signaux, news, cessions) → veille continue via firehose
  + backfill profond au /suivi/add

## Anti-patterns à éviter

❌ **Tout fetch au /recherche/run pour "avoir l'info au cas où"** — sature
le quota Pappers et ralentit l'UX du search (déjà à ~30s sur 20 candidats).

❌ **Tout fetch au /suivi/add pour "garantir la fraîcheur"** — si la donnée
ne bouge pas en quelques minutes (cas général de la donnée légale française),
re-fetch immédiatement après /recherche est gaspillage.

❌ **Données coûteuses utilisées seulement à l'outreach mais fetchées au
search** — ex: ne pas appeler un service de recherche presse à la recherche
si ça ne sert qu'à l'écriture du message.

❌ **Refresh quotidien sur des données stables** — Pappers finances bouge
1× par an (dépôt comptes annuels). Refresh quotidien = 365 appels pour 1
nouvelle info. Cron 2×/mois suffit.

## Exemples appliqués

**Cas 1 : Pappers Premium (actes / comptes / publications BODACC)**
- Coût : 1 jeton par appel, même prix que sans Premium
- Décision : appel au `/recherche/run` (gratuit en plus du standard)
- Mining des signaux au `/suivi/add` (gratuit, parse local du payload)

**Cas 2 : BODACC live**
- Coût : zéro (opendata)
- Décision : 10 events au `/recherche/run` (juste assez pour scorer),
  50 events au `/suivi/add` × toutes les sociétés du portefeuille

**Cas 3 : DVF perso (matching adresse)**
- Coût : zéro mais lent (~2s par commune dense)
- Décision : commune-de-siège au `/recherche/run`. Élargissement adjacent
  envisageable au `/suivi/add` (pas encore implémenté).

**Cas 4 : INPI RNE (quand token disponible)**
- Coût : gratuit avec compte, rate-limited
- Décision attendue : appel au `/suivi/add` uniquement, données RCS
  authoritative pour les prospects qu'on commit à suivre. Pas au search
  (trop de candidats × API lente = mauvais ratio).

**Cas 5 : Refresh enrichissement**
- Coût : 1.5 jeton Pappers par prospect refresh
- Décision : 2×/mois (1er et 15) avec REFRESH_AFTER_DAYS=14. Évite de
  re-payer Pappers pour des données qui ne bougent pas chaque semaine.

## Quand changer ce pattern

Trois signaux justifient de revisiter cette stratégie :

1. **Le quota Pappers passe à 1000+/mois** → on peut pousser plus de depth
   au search
2. **L'UX recherche devient trop lente** (>40s) → réduire la breadth ou
   paralléliser plus agressivement
3. **Un CGP utilisateur dit "j'aurais aimé voir X dès la recherche"** → la
   data X mérite d'être promue de suivi vers recherche

Sinon, par défaut, on suit "cast wide, then dig deep".
