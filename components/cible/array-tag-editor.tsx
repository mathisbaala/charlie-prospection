'use client'
import { useState, type KeyboardEvent } from 'react'
import { X, Plus } from 'lucide-react'
import { StrictToggle } from './strict-toggle'

interface Props {
  label: string
  items: string[]
  onChange: (next: string[]) => void
  variant?: 'default' | 'accent'
  strict: boolean
  onStrictChange: (next: boolean) => void
  placeholder?: string
  /** Optional mapping from raw value to display label (used for signal types) */
  displayLabel?: (item: string) => string
}

/**
 * Editable list of tag chips with add + remove + per-field strict toggle.
 *
 * Used for the array-typed criteria: roles, sectors, locations, keywords,
 * signal_priorities. Replaces the old read-only `criteria-tags.tsx` per-array
 * column.
 */
export function ArrayTagEditor({
  label,
  items,
  onChange,
  variant = 'default',
  strict,
  onStrictChange,
  placeholder = 'Ajouter…',
  displayLabel,
}: Props) {
  const [draft, setDraft] = useState('')

  function commit() {
    const value = draft.trim()
    if (!value) return
    if (items.includes(value)) {
      setDraft('')
      return
    }
    onChange([...items, value])
    setDraft('')
  }

  function remove(item: string) {
    onChange(items.filter((v) => v !== item))
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
        <StrictToggle active={strict} onToggle={() => onStrictChange(!strict)} />
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
