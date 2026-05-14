@AGENTS.md

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
