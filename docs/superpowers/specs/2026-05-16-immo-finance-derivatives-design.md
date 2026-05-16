# Design — Patrimoine immobilier + Dérivées financières UI

**Date :** 2026-05-16
**Branche :** intelligence
**Propriétaire :** Mathis (Intelligence layer)
**Scope :** `/suivi` depth enrichment + fiche prospect UI

---

## Objectif

Enrichir la fiche patrimoniale d'un prospect avec :
1. **Patrimoine immobilier** — biens détenus via ses sociétés (principale + SCI + holdings), reconstitués depuis les transactions DVF enrichies de Cerema + valeur comptable des bilans Pappers Premium.
2. **Dérivées financières UI** — surfacer dans la fiche les dérivées déjà calculées (`ca_trajectory`, `ca_growth_yoy`, `debt_to_equity`, etc.) qui alimentent le scorer Claude mais ne sont pas affichées.

**Contrainte dure :** l'immobilier personnel en nom propre (résidence principale, investissements locatifs personnels) est hors scope — le Service de Publicité Foncière n'est pas accessible via API publique.

---

## Architecture générale

### Deux features indépendantes

**A. Patrimoine immo** — nouvelle source + nouveau champ JSONB dans `enrichment_data`
**B. Dérivées financières UI** — zero nouvelle source, affichage seulement

Aucune nouvelle table Supabase. Tout est stocké dans `enrichment_data` (JSONB) de `prospection_prospects`.

---

## Feature A — Patrimoine immobilier

### Source de données : Cerema DV3F

- **API :** `https://apidf.cerema.fr/api/ff/`
- **Auth :** Bearer token via env var `CEREMA_API_TOKEN`. Si absent, skip silencieux (même pattern que INPI).
- **Endpoints utilisés :**
  - `GET /api/ff/mutations/?siren_acheteur1={SIREN}&ordering=-datemut&page_size=50` — achats
  - `GET /api/ff/mutations/?siren_vendeur1={SIREN}&ordering=-datemut&page_size=50` — ventes

### Placement dans le funnel

- **`/suivi/add` uniquement** (`depth: true`) — jamais à la recherche.
- Raison DATA_STRATEGY : gratuit mais N×2 appels par entité du portfolio. Au search (50 candidats × ~3 entités chacun × 2 appels) = 300 appels par lancement, inacceptable. Au suivi (1 prospect × ~5 entités × 2 appels) = 10 appels, tolérable.

### Logique d'inférence "détenu vs vendu"

Pour chaque SIREN du portfolio :
1. Fetch achats (acheteur1 = SIREN)
2. Fetch ventes (vendeur1 = SIREN)
3. Grouper par `id_parcelle` (identifiant Cerema de la parcelle)
4. Règle : si une parcelle apparaît en achat sans vente ultérieure → `statut: 'detenu'`
5. Si achat + vente ultérieure → `statut: 'vendu'`
6. Fallback si pas d'`id_parcelle` : matching par adresse normalisée

**Niveaux de confiance :**
- `high` : achat < 5 ans, `id_parcelle` présent, aucune vente
- `medium` : achat > 5 ans, ou matching par adresse seulement
- `low` : pas d'`id_parcelle` et adresse approximative

### Source secondaire : Pappers Premium bilans

Le champ `immobilisations_corporelles` du bilan Pappers Premium donne la valeur comptable totale des actifs immobiliers de chaque entité. Déjà fetchés via `PAPPERS_PREMIUM_ENABLED=1`. Tâche : parser ce champ et sommer sur toutes les entités du portfolio pour alimenter `valeur_comptable_totale`.

### Nouveaux types (`lib/types.ts`)

```ts
export interface CeremaHolding {
  siren: string
  entite_nom: string
  adresse: string
  type_local?: string       // Appartement / Maison / Local industriel / Terrain...
  surface_bati?: number
  date_achat: string
  prix_achat: number
  id_parcelle?: string
  confidence: 'high' | 'medium' | 'low'
  statut: 'detenu' | 'vendu'
}

export interface PatrimoineImmo {
  holdings: CeremaHolding[]
  valeur_comptable_totale?: number  // somme immobilisations_corporelles Pappers bilans
  nb_biens_estimes: number          // count(holdings where statut='detenu')
  derniere_transaction?: string     // ISO date de la transaction la plus récente
}
```

Ajout dans `ProspectEnrichmentData` :
```ts
patrimoine_immo?: PatrimoineImmo
```

### Nouveau fichier : `lib/data-sources/cerema.ts`

Exports :
- `interface CeremaMutationRaw` — shape brute de l'API
- `fetchMutationsBySiren(siren: string, token: string): Promise<CeremaMutationRaw[]>`
  - Appelle acheteur + vendeur en parallèle, merge, déduplique
- `inferHoldings(mutations: CeremaMutationRaw[], siren: string, entiteNom: string): CeremaHolding[]`
  - Implémente la logique achat/vente/confidence

Tests : `lib/data-sources/__tests__/cerema.test.ts`

### Modification `lib/enrichment/enricher.ts`

Ajouter `opts?: { depth?: boolean }` au signature de `enrichProspect`. Par défaut `depth: false`.

Étape 2 (déclenchée si `depth: true && personal_portfolio`) :
```
const allPortfolioSirens = [raw.siren, ...personal_portfolio.entites.map(e => e.siren)]
  .filter(Boolean)
  .slice(0, 10)  // cap sécurité

// Parallèle, max 5 concurrent
const holdings = await fetchCeremaHoldingsForPortfolio(allPortfolioSirens, portfolio)

// Parser immobilisations_corporelles depuis pappers_premium
const valeurComptable = parsePappersImmobilisations(enrichment.pappers_premium, portfolio)

enrichment.patrimoine_immo = {
  holdings,                                               // inclut detenu + vendu — l'UI filtre à l'affichage
  valeur_comptable_totale: valeurComptable,
  nb_biens_estimes: holdings.filter(h => h.statut === 'detenu').length,
  derniere_transaction: holdings.sort((a, b) => b.date_achat.localeCompare(a.date_achat))[0]?.date_achat,
}
```

`suivi/add` passe `{ depth: true }` à `enrichProspect`. `recherche/run` ne passe rien (depth=false par défaut).

---

## Feature B — Dérivées financières UI

`finance_derivatives` est calculé dans `enricher.ts` et utilisé dans le scorer Claude mais n'est pas affiché dans la fiche. Modification de `components/prospects/prospect-fiche-content.tsx` uniquement.

### Ajout dans la section "Finances entreprise" (existante)

Après les 4 stats brutes (CA, résultat, fonds propres, marge), insérer :

**Ligne trajectoire** — badge coloré + chiffres clés :
- `growth` → badge vert "↑ Croissance"
- `stable` → badge beige "→ Stable"
- `decline` → badge rouge "↓ Déclin"
- `volatile` → badge orange "~ Volatile"

Suivi des métriques disponibles : `CA +18.5% YoY · CAGR 3y +14.2%`

**Alertes inline :**
- D/E > 1.5 → `⚠ Endettement élevé (D/E X.X)`
- Fonds propres growth > +30% → `↑ Fonds propres +X% — accumulation patrimoniale active`

Condition d'affichage : `ed.finance_derivatives && ed.finance_derivatives.years_available > 0`

---

## UI — Nouvelle section "Patrimoine immobilier"

Dans `prospect-fiche-content.tsx`, après la section "Contexte marché immobilier" existante.

Condition d'affichage : `ed.patrimoine_immo && ed.patrimoine_immo.nb_biens_estimes > 0`

Structure :
```
[Home icon] Patrimoine immobilier
  Résumé : "N biens estimés · Valeur comptable Xk€"

  [Par entité du portfolio]
  SCI DUPONT INVEST
    • 12 rue du Commerce, Lyon — Local commercial
      285m² · Acheté 2019 · 680 000 € · [● haute confiance]

  Société principale
    • 8 av. des Fleurs, Lyon — Local industriel
      420m² · Acheté 2016 · 890 000 € · [● confiance moyenne]

  [Lien collapse] "Voir aussi X cessions" → affiche statut='vendu'

  [Note de bas de section]
  "Données DVF : transactions depuis 2014 seulement. Actifs antérieurs
   non visibles sauf via valeur comptable bilan."
```

---

## Fichiers modifiés / créés

| Fichier | Action | Raison |
|---|---|---|
| `lib/data-sources/cerema.ts` | Créer | Client Cerema DV3F |
| `lib/data-sources/__tests__/cerema.test.ts` | Créer | Tests unitaires inférence |
| `lib/types.ts` | Modifier | `CeremaHolding`, `PatrimoineImmo`, champ dans `ProspectEnrichmentData` |
| `lib/enrichment/enricher.ts` | Modifier | Param `depth`, étape 2 Cerema + parsing bilans |
| `app/api/suivi/add/route.ts` | Modifier | Passer `{ depth: true }` à `enrichProspect` |
| `components/prospects/prospect-fiche-content.tsx` | Modifier | Dérivées financières + section patrimoine immo |

---

## Variables d'environnement

| Var | Valeur | Où |
|---|---|---|
| `CEREMA_API_TOKEN` | Bearer token Cerema | Vercel (prod + preview + dev) |

---

## Ce qui est hors scope

- Immo personnel en nom propre (résidence principale) — SPF non accessible
- Transactions DVF avant 2014 — non couvertes par DVF
- Parsing avancé des actes Infogreffe/INPI pour mentions immo — reporté après token INPI
