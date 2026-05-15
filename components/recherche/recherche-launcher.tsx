'use client'
import { Loader2, Search } from 'lucide-react'
import type { Icp } from '@/lib/types'

interface Props {
  personas: Icp[]
  selectedPersonaId: string | null
  onSelect: (id: string) => void
  onLaunch: () => void
  loading: boolean
  disabled?: boolean
}

/**
 * Top bar of /recherche: persona picker + Lancer button.
 * Persona dropdown shows the saved targets from /cible.
 */
export function RechercheLauncher({
  personas,
  selectedPersonaId,
  onSelect,
  onLaunch,
  loading,
  disabled,
}: Props) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 2,
        padding: 20,
        marginBottom: 24,
      }}
    >
      <div className="flex items-end gap-3">
        <div style={{ flex: 1 }}>
          <label
            className="block"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-muted)',
              marginBottom: 6,
            }}
          >
            Cible
          </label>
          {personas.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-muted)', padding: '8px 0' }}>
              Aucune cible définie. Crée d&apos;abord une cible dans l&apos;onglet{' '}
              <a href="/cible" style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>
                Cible
              </a>
              .
            </p>
          ) : (
            <select
              value={selectedPersonaId ?? ''}
              onChange={(e) => onSelect(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 2,
                padding: '10px 12px',
                fontSize: 14,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            >
              <option value="" disabled>
                Choisir une cible…
              </option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          type="button"
          onClick={onLaunch}
          disabled={!selectedPersonaId || loading || disabled || personas.length === 0}
          className="inline-flex items-center gap-2 transition-opacity disabled:opacity-40"
          style={{
            background: 'var(--color-accent)',
            color: '#FDFAF5',
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 2,
            border: 'none',
            cursor: 'pointer',
            flexShrink: 0,
            height: 40,
          }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {loading ? 'Recherche…' : 'Lancer la recherche'}
        </button>
      </div>
    </div>
  )
}
