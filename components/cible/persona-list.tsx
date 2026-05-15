'use client'
import { Plus, Target } from 'lucide-react'
import type { Icp } from '@/lib/types'

interface Props {
  personas: Icp[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Called to start creating a new persona. */
  onNew: () => void
}

/**
 * Left-rail list of personas. The "+ Nouvelle cible" item at the bottom puts
 * the editor in creation mode (parent sets selectedId=null).
 */
export function PersonaList({ personas, selectedId, onSelect, onNew }: Props) {
  return (
    <aside
      style={{
        width: 260,
        flexShrink: 0,
        borderRight: '1px solid var(--color-border)',
        background: 'var(--color-surface)',
        height: '100%',
        overflowY: 'auto',
        padding: '20px 0',
      }}
    >
      <div style={{ padding: '0 20px', marginBottom: 12 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-muted)',
          }}
        >
          Mes cibles ({personas.length})
        </p>
      </div>
      <nav>
        {personas.map((p) => {
          const active = p.id === selectedId
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '10px 20px',
                background: active ? 'var(--color-accent-dim)' : 'transparent',
                borderLeft: active ? '2px solid var(--color-accent)' : '2px solid transparent',
                border: 'none',
                textAlign: 'left',
                cursor: 'pointer',
                color: active ? 'var(--color-accent)' : 'var(--color-text)',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
              }}
            >
              <Target size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
              <span
                style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  flex: 1,
                }}
              >
                {p.name}
              </span>
              {(p.prospect_count ?? 0) > 0 && (
                <span
                  title={`${p.prospect_count} prospect${(p.prospect_count ?? 0) > 1 ? 's' : ''} en suivi`}
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--color-muted)',
                    background: 'var(--color-bg)',
                    padding: '2px 6px',
                    borderRadius: 2,
                    fontFamily: 'var(--font-mono, monospace)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {p.prospect_count}
                </span>
              )}
              {p.status === 'paused' && (
                <span
                  style={{
                    fontSize: 9,
                    color: 'var(--color-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  pause
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div style={{ marginTop: 8, padding: '0 20px' }}>
        <button
          type="button"
          onClick={onNew}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 12px',
            background: selectedId === null ? 'var(--color-accent)' : 'transparent',
            color: selectedId === null ? '#fff' : 'var(--color-accent)',
            border: '1px solid var(--color-accent)',
            borderRadius: 2,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            width: '100%',
            justifyContent: 'center',
          }}
        >
          <Plus size={13} />
          Nouvelle cible
        </button>
      </div>
    </aside>
  )
}
