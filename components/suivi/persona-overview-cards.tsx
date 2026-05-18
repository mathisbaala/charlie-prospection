'use client'
import { Target, Users, Activity } from 'lucide-react'

interface PersonaSummary {
  id: string
  name: string
  prospects: { id: string }[]
  signals7d: number
}

interface Props {
  summaries: PersonaSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function PersonaOverviewCards({ summaries, selectedId, onSelect }: Props) {
  if (summaries.length === 0) return null

  return (
    <section
      style={{
        padding: '20px 32px 12px 32px',
        background: 'var(--color-bg)',
        borderBottom: '1px solid var(--color-border)',
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(220px, 1fr))`,
        gap: 12,
      }}
    >
      {summaries.map((s) => {
        const active = s.id === selectedId

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
            {/* Nom de la cible */}
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

            {/* Compteurs */}
            <div className="flex items-baseline" style={{ gap: 16 }}>
              <Stat icon={Users} value={String(s.prospects.length)} label="prospects" />
              <Stat
                icon={Activity}
                value={String(s.signals7d)}
                label="signaux"
                accent={s.signals7d > 0}
              />
            </div>
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

