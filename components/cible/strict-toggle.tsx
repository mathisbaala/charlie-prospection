'use client'
import type React from 'react'

interface Props {
  active: boolean
  onToggle: () => void
  label?: string
}

/**
 * Toggle pill that marks a criterion as "strict" — strong score weight, not
 * hard exclusion (owner's chosen semantics).
 *
 * Filled copper when active, outline-only when inactive. The pill sits next
 * to the field label in CriteriaEditor.
 */
export function StrictToggle({ active, onToggle, label = 'Strict' }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      title={
        active
          ? 'Ce critère est prioritaire dans le score (cliquer pour repasser en souple)'
          : 'Cliquer pour rendre ce critère prioritaire dans le score'
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        borderRadius: 2,
        border: '1px solid var(--color-accent)',
        background: active ? 'var(--color-accent)' : 'transparent',
        color: active ? '#fff' : 'var(--color-accent)',
        cursor: 'pointer',
        lineHeight: 1.4,
      }}
    >
      {label}
    </button>
  )
}
