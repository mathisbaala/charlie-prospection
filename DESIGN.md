# Design System — Charlie Prospection

## Product Context
- **What this is:** B2B SaaS prospecting tool that helps French wealth management advisors (CGP) find and qualify high-net-worth prospects using AI-powered ICP building, patrimony scoring, and signals.
- **Who it's for:** Conseillers en Gestion de Patrimoine (CGP) indépendants — independent wealth management advisors in France
- **Space/industry:** Wealth management / gestion de patrimoine (competitors: Wizio, Mozart Prestige Patrimoine, albR, Majors, Capital Explorer)
- **Project type:** B2B web app / dashboard

## Aesthetic Direction
- **Direction:** Intelligence-editorial — the discipline of Stripe, the typographic personality of a premium French publication. A financial intelligence terminal redrawn by someone who reads Monocle.
- **Decoration level:** Intentional — micro-grain on the background, 1px borders, no decorative blobs, no icons in colored circles. The data is the decoration.
- **Mood:** Precise, signal-driven, data-forward. Not the warmth of a private bank client portal, not the playfulness of a fintech startup. Every competitor designs for relationship management (after you have the client). Charlie designs for the intelligence and discovery phase (before the relationship exists). This distinction is the soul of the design.
- **Reference sites:** Wizio (avoid: purple gradients, generic SaaS layout), Stripe (aspire to: precision + personality)

## Typography
- **Display/Hero:** Fraunces (Google Fonts, free, variable) — for **prose hero** (landing titles), **section headings** (H1/H2), **person names** in detail panels, and editorial moments (empty states, onboarding). The only tool in this category that uses a quality serif. **NEVER use Fraunces for financial numbers** — see "Numeric typography" below. Load via `next/font/google`.
- **Body/UI:** Plus Jakarta Sans (Google Fonts, free) — clean, slightly geometric, excellent readability at data density, tabular-nums support. For all labels, table content, navigation, buttons, form fields.
- **Data/Tables/Scores:** Geist Mono — already loaded via `next/font`. For **all** numeric data: patrimony scores, valuations, percentages, amounts, SIREN, ratios, table cells. Always use `font-variant-numeric: tabular-nums`. **This is non-negotiable** — see "Numeric typography" below.
- **Code:** Geist Mono (same as data)
- **Loading:** Google Fonts via `next/font/google` for Fraunces and Plus Jakarta Sans. Geist Mono via `next/font/google` (Geist).
- **Scale:**
  - H1 (page hero): 36–48px, Fraunces, weight 700
  - H2 (section / person name in detail panel): 22–28px, Fraunces, weight 600
  - H3: 17–20px, Plus Jakarta Sans, weight 600
  - Body: 13–14px, Plus Jakarta Sans, weight 400
  - Label (uppercase): 10–11px, Plus Jakarta Sans, weight 700, tracking 0.08–0.12em
  - Table data: 12–13px, Plus Jakarta Sans or Geist Mono depending on content type
  - Table header: 10px, Plus Jakarta Sans, weight 700, uppercase, tracking 0.08em
  - **Numeric KPI** (score / valuation in detail panel header): 28–32px, Geist Mono, weight 600 — never larger
  - **Numeric breakdown / stats**: 13–14px, Geist Mono, weight 600

## Numeric typography — Bloomberg discipline

**All financial numbers use Geist Mono with `font-variant-numeric: tabular-nums`.** Display serifs (Fraunces) are **never** used for financial data — they are reserved for prose, names, and editorial moments. This rule is what separates Charlie from "trendy fintech UI" and aligns it with the working tools serious finance professionals actually use (Bloomberg Terminal, Refinitiv, FactSet, BlackRock Aladdin).

Concrete rules:
- **Maximum numeric size: 32px.** A patrimony score is data, not signage. There is no use case for a number larger than 32px in this app.
- **Color: `var(--color-text)` (ink) by default.** Reserve `var(--color-accent)` (copper) for the value that is actively being interacted with (e.g. selected row's score in a table, breakdown bar fills). Reserve `var(--color-error)` for negative/risk values. Numbers are not decoration.
- **Never write `/100` after scores.** The denominator is implicit. Same for `%` on ratios where the unit is unambiguous.
- **Tabular-nums always** for column alignment and visual consistency across rows.
- **Weight: 600** for primary numeric values, **500** for secondary, **400** for supporting context (e.g. annotations).

## Color
- **Approach:** Restrained — one copper accent used sparingly. Color signals meaning, not decoration.
- **Background:** `#F3EFE6` — warm parchment. Not clinical white, not dark navy. Every competitor uses one of those two. This makes the app feel like a premium document — the difference between a photocopied form and a bank letter on heavy stock paper.
- **Surface:** `#FDFAF5` — cards, panels, nav rail, table rows default
- **Primary text:** `#1A1612` — near-black with warm undertone. Ink, not digital black.
- **Muted text:** `#6F6358` — warm grey for labels, placeholders, secondary info
- **Border:** `#E2DBD0` — subtle warm divider. All borders are 1px. No 2px borders except the active nav rail indicator.
- **Accent:** `#BC6B2A` — copper. Not gold (that reads "legacy wealth management"). Not orange (that reads "generic fintech startup"). Copper is material, earned, aged. Used only on: active nav indicator, primary buttons, ICP score highlights, intelligence strip background, active table row left border, links.
- **Accent dim:** `rgba(188, 107, 42, 0.10)` — used for active row backgrounds, hover states, accent-tinted surfaces
- **Success:** `#2A6B4A` — forest green, not mint startup green
- **Warning:** `#B45A1A` — terracotta
- **Error:** `#8B2233` — deep claret
- **Dark mode strategy:** Invert surfaces (bg → `#131110`, surface → `#1D1B18`), warm the accent slightly (`#D4844A`), reduce contrast by 15%. Light-first product; dark mode is a quality-of-life addition, not the primary experience.

## CSS Custom Properties (implement these in globals.css)
```css
:root {
  --color-bg:           #F3EFE6;
  --color-surface:      #FDFAF5;
  --color-text:         #1A1612;
  --color-muted:        #6F6358;
  --color-border:       #E2DBD0;
  --color-accent:       #BC6B2A;
  --color-accent-dim:   rgba(188, 107, 42, 0.10);
  --color-success:      #2A6B4A;
  --color-warning:      #B45A1A;
  --color-error:        #8B2233;
}
[data-mode="dark"] {
  --color-bg:           #131110;
  --color-surface:      #1D1B18;
  --color-text:         #EDE9E0;
  --color-muted:        #8C7F72;
  --color-border:       #2C2824;
  --color-accent:       #D4844A;
}
```

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — not cramped, not airy
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(12px) lg(16px) xl(24px) 2xl(32px) 3xl(48px) 4xl(64px)
- **Table rows:** 48px minimum height — breathing room without waste
- **Nav rail:** 240px fixed width
- **Right context panel:** 320px fixed width

## Layout
- **Approach:** Grid-disciplined — strict 3-panel command center for the app shell
- **3-panel shell:**
  - Left rail: 240px fixed, navigation only, no collapsing on desktop
  - Center canvas: `flex: 1`, the working surface — data tables, ICP builder, outreach views
  - Right panel: 320px, context-sensitive (slides in on row selection, not a modal or page nav)
- **Border radius:** 2px maximum — rectangles, not bubbles. The app is for precision work. `2px` for inputs, cards, badges, buttons. `0` for table rows. No `rounded-xl`, no `rounded-2xl`.
- **Active state convention:** 2px left border in `--color-accent`. No background color fills as the sole active indicator — the border is the signal.
- **Intelligence strip:** Fixed at top of center canvas. Copper background (`--color-accent`), white text, `font-size: 11.5px`. Shows proactive AI-generated insight. Example: «3 prospects qualifiés pour restructuration ISF cette semaine — selon votre ICP.»
- **No dashboard homepage:** The app opens directly in the pipeline view. There is no "welcome back" landing screen with KPI cards. The first thing the user sees is work, not metrics about work.

## Motion
- **Approach:** Minimal-functional — only motion that aids comprehension
- **Easing:** enter(`ease-out`) exit(`ease-in`) move(`ease-in-out`)
- **Duration:** micro(50–100ms) short(150–200ms) medium(250–300ms)
- **What moves:** Row hover (1px shadow lift + subtle bg, 80ms). Right panel slide-in (320ms ease-out). Toast notifications (150ms ease-out in, 200ms ease-in out). Nothing bounces, nothing spins, no entrance animations on data rows.
- **What does not move:** Page transitions (instant), table sorts (instant), filter changes (instant).

## Key Design Decisions (the ones that make Charlie look like Charlie)

### The Three Risks
These three choices are where Charlie earns its distinctive face. Do not remove them without explicit design review.

1. **Parchment background (#F3EFE6)** — Every competitor uses clinical white or dark navy. This makes the app feel like a premium document. Risk accepted: might feel "document-viewer-ish" to new users. Gain: unmistakably premium, unlike anything in the category. Implementation: set `background: var(--color-bg)` on `<body>`, not `bg-white`.

2. **Fraunces serif for editorial moments and person names** — Every other CGP tool uses a generic sans-serif for everything. A quality serif for H1, H2, and person names in detail panels reads authoritative and considered. Implementation: `font-family: 'Fraunces', serif` on H1 (36–48px), H2 (22–28px including person names in detail panel headers), and editorial moments (empty states, onboarding). **Never use Fraunces for body text, table content, or financial numbers** — see "Numeric typography" rule.

3. **Pipeline-first landing, no dashboard homepage** — The user lands directly in their prospect pipeline, ranked by patrimony score. No dashboard with KPI cards. The intelligence strip at the top of the canvas delivers the proactive insight instead. Implementation: default route should redirect to `/pipeline` or the primary list view.

### Detail panel hierarchy — name-as-hero, score-as-KPI

The patrimony ICP score is **not** the visual hero of the detail panel — the **person's name** is. A CGP refers to their prospect by name, not by score. The score is a metric, presented in a compact KPI block.

Implementation in `pipeline-detail-panel.tsx`:
- **Surface**: parchment continues from the rest of the app — no dark surface header. The detail panel is part of the document, not a separate billboard.
- **Layout**: 2-column header. Left column (flex 1): eyebrow tag (`PROFESSIONNEL DE SANTÉ` / `DIRIGEANT`), then person name in Fraunces 26px weight 600, then meta line (rôle · société · ville) in 13px Plus Jakarta muted. Right column (240–280px fixed): KPI block with `PATRIMOINE` label, score in Geist Mono 32px ink, divider, valuation estimate in Geist Mono 13px muted with "estimé" suffix.
- **Total header height**: ~120–140px. Anything more is over-design.
- **Stage pills** below the header, **tabs** below the pills. One row each, no chrome on chrome.

## Anti-Patterns (never implement these)
- Purple or violet gradients as accent
- `font-family: Inter` or `font-family: system-ui` as primary font
- `rounded-xl` or `rounded-2xl` border radius (max is `rounded-sm` / 2px)
- 3-column feature grids with icons in colored circles
- Centered-everything layout for the dashboard
- A "welcome back" dashboard with KPI cards as the landing screen
- Gradient buttons
- `bg-white` as the default page background (use `--color-bg` parchment instead)
- Gold accent color (#FFD700 or similar)
- **Display serif fonts (Fraunces) for financial numbers** — scores, valuations, %, amounts must be Geist Mono
- **Numeric values larger than 32px** anywhere (a score is data, not signage)
- **Explicit `/100` denominator** on scores
- **Dark surface headers in the middle of light-surface app shells** (the detail panel header must continue the parchment background, not introduce a dark band)
- **Detail panel headers taller than 150px** (compact, document-like, not billboard-like)

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-14 | Initial design system created | /design-consultation based on competitive research (Wizio, Mozart, Majors) and outside design voice (Claude subagent). Research finding: all French CGP tools design for relationship management; Charlie designs for the intelligence/discovery phase. |
| 2026-05-14 | Parchment background #F3EFE6 | Deliberate departure from category norms (white/navy). Signals premium document quality. |
| 2026-05-14 | Fraunces serif as display font | No CGP tool in France uses a quality serif. Visual signal of considered design. Free via Google Fonts. |
| 2026-05-14 | Copper accent #BC6B2A | Not gold (legacy), not orange (generic fintech). Copper is material and earned. |
| 2026-05-14 | Pipeline-first landing (no dashboard) | Respects user time. The intelligence strip delivers proactive value instead. |
| 2026-05-14 | Score-as-hero in right panel | Charlie is a qualification tool, not an address book. Score before name. |
| 2026-05-14 | Plus Jakarta Sans for body | Clean at data density, tabular-nums, free, more distinctive than DM Sans. |
| 2026-05-16 | Fiche client refonte — banque privée hierarchy | Header passe de ~280px à ~130px. Suppression du dark surface header (continuité parchment). Nom de la personne en hero (Fraunces 26px, gauche), score+valorisation en bloc KPI encadré à droite (Geist Mono 32px ink). Adresse feedback CGP "trop trendy / illisible". Voir `pipeline-detail-panel.tsx`. |
| 2026-05-16 | Bloomberg discipline numérique | Tous les chiffres financiers en Geist Mono tabular, jamais en serif display. Suppression de l'ancienne règle "Score-as-hero / Score 88-96px Fraunces". Anti-patterns ajoutés : pas de "/100", pas de chiffre >32px, pas de display serif sur valeurs numériques. Aligne Charlie sur les outils de finance pro (Bloomberg, Refinitiv, FactSet) au lieu de l'esthétique fintech. |
