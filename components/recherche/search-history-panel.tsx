'use client'
import { useState } from 'react'
import type { SearchHistoryEntry } from '@/lib/recherche/context'

function relativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "À l'instant"
  if (minutes < 60) return `Il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Hier'
  if (days < 7) return `Il y a ${days}j`
  return new Date(isoDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

interface Props {
  history: SearchHistoryEntry[]
  onRestore: (entry: SearchHistoryEntry) => void
}

export function SearchHistoryPanel({ history, onRestore }: Props) {
  const [open, setOpen] = useState(false)

  if (history.length === 0) return null

  return (
    <div style={{ marginBottom: 20 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 0',
          color: 'var(--color-muted)',
          fontSize: 12,
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 150ms ease',
          }}
        >
          <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M6 3.5V6L7.5 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        Historique des recherches
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontVariantNumeric: 'tabular-nums',
            fontSize: 11,
            color: 'var(--color-muted)',
            opacity: 0.7,
          }}
        >
          ({history.length})
        </span>
      </button>

      {open && (
        <div
          style={{
            marginTop: 8,
            border: '1px solid var(--color-border)',
            borderRadius: 2,
            overflow: 'hidden',
            background: 'var(--color-surface)',
          }}
        >
          {history.map((entry, idx) => (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderBottom: idx < history.length - 1 ? '1px solid var(--color-border)' : 'none',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--color-text)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {entry.personaName}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono, monospace)',
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: 11,
                      color: 'var(--color-muted)',
                    }}
                  >
                    {entry.candidateCount} résultat{entry.candidateCount !== 1 ? 's' : ''}
                  </span>
                  <span style={{ color: 'var(--color-border)', fontSize: 10 }}>·</span>
                  <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                    {relativeTime(entry.searchedAt)}
                  </span>
                  {entry.filteredCount > 0 && (
                    <>
                      <span style={{ color: 'var(--color-border)', fontSize: 10 }}>·</span>
                      <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                        {entry.filteredCount} filtré{entry.filteredCount !== 1 ? 's' : ''}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => onRestore(entry)}
                style={{
                  flexShrink: 0,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--color-accent)',
                  background: 'var(--color-accent-dim)',
                  border: '1px solid transparent',
                  borderRadius: 2,
                  cursor: 'pointer',
                  transition: 'opacity 100ms',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                Restaurer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
