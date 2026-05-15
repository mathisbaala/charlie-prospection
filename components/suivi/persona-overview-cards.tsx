'use client'
import { Target, Users, Activity, TrendingUp } from 'lucide-react'
import type { Prospect } from '@/lib/types'

interface PersonaSummary {
  id: string
  name: string
  prospects: Prospect[]
  signals7d: number
}

interface Props {
  summaries: PersonaSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
}

const STAGE_LABELS: Record<string, string> = {
  new: 'Nouveau',
  to_contact: 'À contacter',
  contacted: 'Contacté',
  meeting: 'RDV',
  client: 'Client',
  lost: 'Perdu',
}

/**
 * Per-persona overview cards rendered above the /suivi tabs. Gives the user
 * an at-a-glance dashboard across all their personas without having to click
 * through tabs:
 *   - total prospects in /suivi for this persona
 *   - avg patrimony_score
 *   - count of fresh signals last 7d
 *   - CRM stage distribution (mini-bar)
 *
 * Clicking a card switches the active tab. The selected card gets a copper
 * accent border to mirror the tab selection state.
 */
export function PersonaOverviewCards({ summaries, selectedId, onSelect }: Props) {
  if (summaries.length === 0) return null

  return (
    <section
      style={{
        padding: '20px 32px 12px 32px',
        background: 'var(--color-bg)',
        borderBottom: '1px solid var(--color-border)',
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(260px, 1fr))`,
        gap: 12,
      }}
    >
      {summaries.map((s) => {
        const active = s.id === selectedId
        const total = s.prospects.length
        const avgScore =
          total > 0
            ? Math.round(
                s.prospects.reduce((sum, p) => sum + (p.patrimony_score ?? 0), 0) / total,
              )
            : 0
        const stages = countByStage(s.prospects)

        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            aria-pressed={active}
            style={{
              textAlign: 'left',
              background: 'var(--color-surface)',
              border: active ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
              borderLeft: active ? '3px solid var(--color-accent)' : '3px solid transparent',
              borderRadius: 2,
              padding: '14px 16px',
              cursor: 'pointer',
              transition: 'border-color 120ms',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.borderColor = 'var(--color-text)'
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.borderColor = 'var(--color-border)'
            }}
          >
            {/* Header — persona name */}
            <div className="flex items-center gap-2">
              <Target size={13} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {s.name}
              </span>
            </div>

            {/* Stats row */}
            <div className="flex items-baseline" style={{ gap: 16 }}>
              <Stat icon={Users} value={String(total)} label="prospects" />
              <Stat
                icon={TrendingUp}
                value={total > 0 ? String(avgScore) : '—'}
                label="score moy."
                accent
              />
              <Stat
                icon={Activity}
                value={String(s.signals7d)}
                label="sig. 7j"
                accent={s.signals7d > 0}
              />
            </div>

            {/* Stage mini-bar */}
            {total > 0 && (
              <div style={{ display: 'flex', height: 4, gap: 1 }}>
                {Object.entries(stages).map(([stage, count]) =>
                  count > 0 ? (
                    <div
                      key={stage}
                      title={`${count} ${STAGE_LABELS[stage] ?? stage}`}
                      style={{
                        flex: count,
                        background: stageColor(stage),
                      }}
                    />
                  ) : null,
                )}
              </div>
            )}
          </button>
        )
      })}
    </section>
  )
}

function Stat({
  icon: Icon,
  value,
  label,
  accent,
}: {
  icon: React.ElementType
  value: string
  label: string
  accent?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, minWidth: 0 }}>
      <Icon
        size={11}
        style={{ color: 'var(--color-muted)', flexShrink: 0, alignSelf: 'center' }}
      />
      <span
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: accent ? 'var(--color-accent)' : 'var(--color-text)',
          fontFamily: 'var(--font-mono, monospace)',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{label}</span>
    </div>
  )
}

function countByStage(prospects: Prospect[]): Record<string, number> {
  const out: Record<string, number> = {
    new: 0,
    to_contact: 0,
    contacted: 0,
    meeting: 0,
    client: 0,
    lost: 0,
  }
  for (const p of prospects) out[p.crm_stage] = (out[p.crm_stage] ?? 0) + 1
  return out
}

function stageColor(stage: string): string {
  switch (stage) {
    case 'new':
      return 'var(--color-muted)'
    case 'to_contact':
      return 'var(--color-accent)'
    case 'contacted':
      return 'var(--color-accent)'
    case 'meeting':
      return 'var(--color-text)'
    case 'client':
      return 'var(--color-success, #4a7)'
    case 'lost':
      return 'var(--color-error, #c44)'
    default:
      return 'var(--color-border)'
  }
}
