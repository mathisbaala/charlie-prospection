<!-- Lis OWNERSHIP.md avant de soumettre cette PR. -->

## Couche concernée

<!-- Coche UNE seule case. Si ta PR touche les deux couches, c'est qu'il
     faut probablement la découper en deux. -->

- [ ] 🔬 **Intelligence** (Mathis) — Cible / Recherche / Suivi /
      data-sources / crons / scoring patrimoine
- [ ] 📨 **Engagement** (Associé) — Outreach / messages / campagnes /
      CRM stage progression / interactions log
- [ ] 🔧 **Cross-cutting** (rare) — config, docs, infra, design system

## Branche source

<!-- intelligence → main ? engagement → main ? feature → intelligence ? -->

## Changements

<!-- 2-5 bullets. Quoi, pas pourquoi (le pourquoi vit dans les commits). -->

-
-
-

## Migration DB ?

- [ ] Pas de migration
- [ ] Migration ajoutée → **appliquée en prod avant le merge** ✓
- [ ] Migration ajoutée → à appliquer après le merge (préciser :)

## Tests

- [ ] tsc clean (`npx tsc --noEmit`)
- [ ] Tests passent (`npm test`)
- [ ] Lint clean (`npm run lint`)
- [ ] Build OK (`npm run build`)

## Touche un fichier partagé ?

<!-- Cocher si la PR touche un de ces fichiers — coordination requise. -->

- [ ] `lib/types.ts`
- [ ] `components/prospects/pipeline-detail-panel.tsx` (4 tabs)
- [ ] `prospection_prospects` table (colonnes engagement vs intelligence)
- [ ] `OWNERSHIP.md`, `DESIGN.md`, `CLAUDE.md`

## Capture d'écran (si UI)

<!-- Avant / Après si visuel -->
