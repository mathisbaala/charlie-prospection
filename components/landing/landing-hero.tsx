'use client'

import { forwardRef, useImperativeHandle, useRef } from 'react'

const SUGGESTIONS = [
  'Comptables en Gironde',
  'Ressources humaines PME',
  'CEO engrais bio',
  'Vétérinaires diplômés',
  'Responsables achats',
] as const

const PLACEHOLDER = 'Ex : Chirurgiens lyonnais proches de la retraite…'

interface Props {
  description: string
  onDescriptionChange: (value: string) => void
  onSubmit: () => void
  disabled: boolean
}

export interface LandingHeroHandle {
  focus: () => void
  scrollIntoView: () => void
}

export const LandingHero = forwardRef<LandingHeroHandle, Props>(function LandingHero(
  { description, onDescriptionChange, onSubmit, disabled },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null)
  const sectionRef = useRef<HTMLElement>(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    scrollIntoView: () => sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
  }))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim() || disabled) return
    onSubmit()
  }

  return (
    <section
      ref={sectionRef}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 24px 64px',
        maxWidth: 660,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <h1
        className="font-display"
        style={{
          fontSize: 'clamp(36px, 5.5vw, 52px)',
          fontWeight: 700,
          lineHeight: 1.08,
          letterSpacing: '-0.03em',
          textAlign: 'center',
          color: 'var(--color-text)',
          marginBottom: 14,
        }}
      >
        Qui cherchez-vous&nbsp;?
      </h1>
      <p
        style={{
          fontSize: 15,
          color: 'var(--color-muted)',
          textAlign: 'center',
          marginBottom: 32,
          lineHeight: 1.5,
        }}
      >
        Décrivez votre prospect idéal.
      </p>

      <form onSubmit={handleSubmit} style={{ width: '100%' }}>
        <div
          style={{
            display: 'flex',
            width: '100%',
            border: '1px solid var(--color-border)',
            borderRadius: 2,
            background: 'var(--color-surface)',
            overflow: 'hidden',
            transition: 'border-color 120ms',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-text)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
        >
          <input
            ref={inputRef}
            type="text"
            value={description}
            onChange={e => onDescriptionChange(e.target.value)}
            placeholder={PLACEHOLDER}
            aria-label="Décrivez votre prospect idéal"
            disabled={disabled}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontFamily: 'inherit',
              fontSize: 14,
              color: 'var(--color-text)',
              padding: '14px 16px',
              lineHeight: 1.4,
              minWidth: 0,
            }}
          />
          <button
            type="submit"
            disabled={disabled || !description.trim()}
            style={{
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 600,
              padding: '0 24px',
              background: 'var(--color-text)',
              color: 'var(--color-bg)',
              border: 'none',
              cursor: disabled || !description.trim() ? 'not-allowed' : 'pointer',
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              opacity: disabled || !description.trim() ? 0.5 : 1,
              transition: 'opacity 100ms',
            }}
          >
            Lancer la recherche
          </button>
        </div>
      </form>

      <div
        role="list"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          justifyContent: 'center',
          marginTop: 20,
        }}
      >
        {SUGGESTIONS.map(s => (
          <button
            key={s}
            role="listitem"
            type="button"
            disabled={disabled}
            onClick={() => onDescriptionChange(s)}
            style={{
              fontFamily: 'inherit',
              fontSize: 12.5,
              fontWeight: 500,
              padding: '6px 13px',
              border: '1px solid var(--color-border)',
              borderRadius: 2,
              background: 'transparent',
              color: 'var(--color-muted)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              lineHeight: 1.3,
              transition: 'all 100ms',
              opacity: disabled ? 0.5 : 1,
            }}
            onMouseEnter={e => {
              if (disabled) return
              e.currentTarget.style.borderColor = 'var(--color-accent)'
              e.currentTarget.style.color = 'var(--color-accent)'
              e.currentTarget.style.background = 'var(--color-accent-dim)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.color = 'var(--color-muted)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </section>
  )
})
