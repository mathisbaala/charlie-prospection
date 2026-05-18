'use client'
import { useState, useRef, useEffect, useId } from 'react'
import { Loader2, Search, ChevronDown } from 'lucide-react'
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
 * Top bar of /recherche: persona combobox + launch button.
 */
export function RechercheLauncher({
  personas,
  selectedPersonaId,
  onSelect,
  onLaunch,
  loading,
  disabled,
}: Props) {
  const selectedPersona = personas.find((p) => p.id === selectedPersonaId) ?? null

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  const filtered = query.trim()
    ? personas.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    : personas

  // Fermer en cliquant dehors
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Reset highlighted quand le filtre change
  useEffect(() => {
    setHighlighted(0)
  }, [query])

  function openDropdown() {
    setQuery('')
    setHighlighted(selectedPersona ? Math.max(0, filtered.indexOf(selectedPersona)) : 0)
    setOpen(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function selectItem(persona: Icp) {
    onSelect(persona.id)
    setOpen(false)
    setQuery('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        openDropdown()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlighted]) selectItem(filtered[highlighted])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

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
        <div ref={containerRef} style={{ flex: 1, position: 'relative' }}>
          <label
            htmlFor="persona-combobox"
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
            <>
              {/* Trigger + input */}
              <div
                role="combobox"
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-controls={listboxId}
                onClick={() => (open ? null : openDropdown())}
                onKeyDown={handleKeyDown}
                tabIndex={open ? -1 : 0}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  background: 'var(--color-bg)',
                  border: `1px solid ${open ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  borderRadius: 2,
                  padding: '0 10px',
                  height: 40,
                  cursor: open ? 'text' : 'pointer',
                  boxSizing: 'border-box',
                  transition: 'border-color 100ms',
                }}
              >
                {open ? (
                  <input
                    ref={inputRef}
                    id="persona-combobox"
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Rechercher une cible…"
                    autoComplete="off"
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      fontSize: 14,
                      color: 'var(--color-text)',
                      fontFamily: 'inherit',
                    }}
                  />
                ) : (
                  <span
                    id="persona-combobox"
                    style={{
                      flex: 1,
                      fontSize: 14,
                      color: selectedPersona ? 'var(--color-text)' : 'var(--color-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {selectedPersona?.name ?? 'Choisir une cible…'}
                  </span>
                )}
                <ChevronDown
                  size={14}
                  color="var(--color-muted)"
                  style={{
                    flexShrink: 0,
                    marginLeft: 6,
                    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 150ms ease',
                  }}
                />
              </div>

              {/* Dropdown */}
              {open && (
                <ul
                  id={listboxId}
                  role="listbox"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 2,
                    boxShadow: '0 4px 16px rgba(26,22,18,0.10)',
                    zIndex: 50,
                    margin: 0,
                    padding: '4px 0',
                    listStyle: 'none',
                    maxHeight: 260,
                    overflowY: 'auto',
                  }}
                >
                  {filtered.length === 0 ? (
                    <li
                      style={{
                        padding: '10px 14px',
                        fontSize: 13,
                        color: 'var(--color-muted)',
                        fontStyle: 'italic',
                      }}
                    >
                      Aucune cible trouvée
                    </li>
                  ) : (
                    filtered.map((p, i) => {
                      const isSelected = p.id === selectedPersonaId
                      const isHighlighted = i === highlighted
                      return (
                        <li
                          key={p.id}
                          role="option"
                          aria-selected={isSelected}
                          onMouseEnter={() => setHighlighted(i)}
                          onClick={() => selectItem(p)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '9px 14px',
                            fontSize: 13,
                            cursor: 'pointer',
                            color: isSelected ? 'var(--color-accent)' : 'var(--color-text)',
                            fontWeight: isSelected ? 600 : 400,
                            background: isHighlighted
                              ? 'var(--color-accent-dim)'
                              : 'transparent',
                            borderLeft: isSelected
                              ? '2px solid var(--color-accent)'
                              : '2px solid transparent',
                          }}
                        >
                          <span style={{ flex: 1 }}>{p.name}</span>
                          {isSelected && (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path
                                d="M2 6L5 9L10 3"
                                stroke="var(--color-accent)"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </li>
                      )
                    })
                  )}
                </ul>
              )}
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onLaunch}
          disabled={!selectedPersonaId || loading || disabled || personas.length === 0}
          aria-label="Lancer la recherche"
          className="inline-flex items-center justify-center transition-opacity disabled:opacity-40"
          style={{
            background: 'var(--color-accent)',
            color: '#FDFAF5',
            width: 40,
            height: 40,
            borderRadius: 2,
            border: 'none',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
        </button>
      </div>
    </div>
  )
}
