'use client'
import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { X, Plus } from 'lucide-react'

interface Props {
  label: string
  items: string[]
  onChange: (next: string[]) => void
  variant?: 'default' | 'accent'
  placeholder?: string
  /** Optional mapping from raw value to display label (used for signal types) */
  displayLabel?: (item: string) => string
  /** Pre-defined suggestions for this category */
  suggestions?: string[]
}

export function ArrayTagEditor({
  label,
  items,
  onChange,
  variant = 'default',
  placeholder = 'Ajouter…',
  displayLabel,
  suggestions,
}: Props) {
  const [draft, setDraft] = useState('')
  const [suggestOpen, setSuggestOpen] = useState(false)
  const suggestRef = useRef<HTMLDivElement>(null)

  // Fermer le panneau de suggestions au clic extérieur
  useEffect(() => {
    if (!suggestOpen) return
    function handler(e: MouseEvent) {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) {
        setSuggestOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [suggestOpen])

  function commit() {
    const value = draft.trim()
    if (!value || items.includes(value)) {
      setDraft('')
      return
    }
    onChange([...items, value])
    setDraft('')
  }

  function remove(item: string) {
    onChange(items.filter((v) => v !== item))
  }

  function addSuggestion(value: string) {
    if (!items.includes(value)) onChange([...items, value])
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && draft === '' && items.length > 0) {
      e.preventDefault()
      remove(items[items.length - 1])
    }
  }

  const isAccent = variant === 'accent'
  const tagBg = isAccent ? 'var(--color-accent-dim)' : 'var(--color-bg)'
  const tagColor = isAccent ? 'var(--color-accent)' : 'var(--color-text)'
  const tagBorder = isAccent ? 'var(--color-accent)' : 'var(--color-border)'

  const availableSuggestions = suggestions?.filter((s) => !items.includes(s)) ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-muted)',
          }}
        >
          {label}
        </p>

        {suggestions && suggestions.length > 0 && (
          <div ref={suggestRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setSuggestOpen((v) => !v)}
              title="Suggestions"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                color: suggestOpen ? 'var(--color-accent)' : 'var(--color-muted)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 4px',
              }}
            >
              <Plus size={11} />
            </button>

            {suggestOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  width: 280,
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 2,
                  boxShadow: '0 4px 16px rgba(26,22,18,0.10)',
                  zIndex: 40,
                  padding: 12,
                }}
              >
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--color-muted)',
                    marginBottom: 10,
                  }}
                >
                  Ajouter depuis la liste
                </p>
                {availableSuggestions.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--color-muted)', fontStyle: 'italic' }}>
                    Toutes les suggestions sont déjà ajoutées.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {availableSuggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => addSuggestion(s)}
                        style={{
                          padding: '4px 10px',
                          fontSize: 12,
                          fontWeight: 500,
                          borderRadius: 2,
                          background: 'var(--color-bg)',
                          color: 'var(--color-text)',
                          border: '1px solid var(--color-border)',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--color-accent-dim)'
                          e.currentTarget.style.borderColor = 'var(--color-accent)'
                          e.currentTarget.style.color = 'var(--color-accent)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'var(--color-bg)'
                          e.currentTarget.style.borderColor = 'var(--color-border)'
                          e.currentTarget.style.color = 'var(--color-text)'
                        }}
                      >
                        {displayLabel ? displayLabel(s) : s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {items.map((item) => (
          <span
            key={item}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 2,
              background: tagBg,
              color: tagColor,
              border: `1px solid ${tagBorder}`,
            }}
          >
            {displayLabel ? displayLabel(item) : item}
            <button
              onClick={() => remove(item)}
              aria-label={`Retirer ${item}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                color: 'inherit',
                opacity: 0.6,
              }}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 4px 2px 10px',
            background: 'var(--color-bg)',
            border: '1px dashed var(--color-border)',
            borderRadius: 2,
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder={placeholder}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 12,
              fontFamily: 'inherit',
              color: 'var(--color-text)',
              width: Math.max(80, draft.length * 7 + 20),
              padding: 0,
            }}
          />
          <button
            type="button"
            onClick={commit}
            disabled={!draft.trim()}
            aria-label="Ajouter"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              cursor: draft.trim() ? 'pointer' : 'default',
              padding: '2px 4px',
              color: draft.trim() ? 'var(--color-accent)' : 'var(--color-muted)',
              opacity: draft.trim() ? 1 : 0.4,
            }}
          >
            <Plus size={12} />
          </button>
        </span>
      </div>
    </div>
  )
}
