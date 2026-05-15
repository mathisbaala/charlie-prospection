@AGENTS.md

## Code ownership — two-founder split

ALWAYS read OWNERSHIP.md before modifying any file. The project is co-built by
two founders with strictly separated scopes:

- **Mathis owns the Intelligence layer**: prospect discovery, identification,
  qualification, enrichment, monitoring. Tabs `/cible`, `/recherche`, `/suivi`.
  All data sources (Pappers, Sirene, BODACC, INPI, DVF, RPPS), all crons,
  patrimony scoring, signal pipeline.
- **Associé owns the Engagement layer**: outreach, contact, campaigns.
  Tab `/outreach` (to rebuild), message generation, CRM stage progression,
  interactions log, sequences.

Both touch `prospection_prospects` but with strict write rules: Mathis writes
`enrichment_data` / `patrimony_score` / `last_signal_at` ; Associé writes
`crm_stage` and the contact-related parts of `linkedin_data`.

When you (Claude or human dev) work on a file, check OWNERSHIP.md to confirm
which co-founder owns it. If a new file or table needs to be added, add the
mention to OWNERSHIP.md in the same PR.

## Design System
Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, border-radius, and aesthetic direction are defined there.
Do not deviate without explicit user approval.

Key rules enforced by DESIGN.md:
- Background is #F3EFE6 parchment — never `bg-white` or `background: white`
- Accent is #BC6B2A copper — never purple/violet gradients, never gold
- Display font is Fraunces (serif) — never Inter, system-ui, or Space Grotesk
- Body font is Plus Jakarta Sans — never Roboto, Arial, or Helvetica
- Data/numbers use Geist Mono — always `font-variant-numeric: tabular-nums`
- Border radius max is 2px — never `rounded-xl`, `rounded-2xl`, or `rounded-full` on cards
- No dashboard homepage — the app opens directly in the pipeline view
- Patrimony score is displayed before the prospect's name in detail panels

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
