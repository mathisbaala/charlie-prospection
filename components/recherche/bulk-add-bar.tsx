'use client'
import { Loader2, Plus } from 'lucide-react'

interface Props {
  count: number
  onAdd: () => void
  loading: boolean
}

/**
 * Sticky bottom bar that appears when one or more candidates are selected.
 * Submits to /api/suivi/add via the parent.
 */
export function BulkAddBar({ count, onAdd, loading }: Props) {
  if (count === 0) return null

  return (
    <div
      style={{
        position: 'sticky',
        bottom: 16,
        marginTop: 24,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-accent)',
        borderRadius: 2,
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      }}
    >
      <div style={{ fontSize: 13, color: 'var(--color-text)' }}>
        <strong style={{ fontWeight: 600 }}>{count}</strong> prospect
        {count > 1 ? 's' : ''} sélectionné{count > 1 ? 's' : ''}
      </div>
      <button
        type="button"
        onClick={onAdd}
        disabled={loading}
        className="inline-flex items-center gap-2 transition-opacity disabled:opacity-40"
        style={{
          background: 'var(--color-accent)',
          color: '#FDFAF5',
          padding: '8px 14px',
          fontSize: 13,
          fontWeight: 600,
          borderRadius: 2,
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        {loading ? 'Ajout…' : 'Ajouter au suivi'}
      </button>
    </div>
  )
}
