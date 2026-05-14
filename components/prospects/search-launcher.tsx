'use client'
import { useState } from 'react'
import { Search, Loader2, Trash2 } from 'lucide-react'
import type { ParsedIcpCriteria } from '@/lib/types'

interface Props {
  icpId: string
  criteria: ParsedIcpCriteria
  onComplete: () => void
}

export function SearchLauncher({ icpId, criteria, onComplete }: Props) {
  const [loading, setLoading] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [result, setResult] = useState<{ count: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSearch() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/prospects/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ criteria, icp_id: icpId, limit: 30 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult({ count: data.count })
      onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  async function handleClear() {
    if (!confirm('Supprimer tous les prospects enregistrés ? Cette action est irréversible.')) return
    setClearing(true)
    setError(null)
    try {
      const res = await fetch('/api/prospects', { method: 'DELETE' })
      if (!res.ok) throw new Error('Erreur lors de la suppression')
      setResult(null)
      onComplete()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setClearing(false)
    }
  }

  return (
    <div
      className="flex items-center justify-between gap-4"
      style={{
        padding: '14px 18px',
        background: 'var(--color-accent-dim)',
        borderLeft: '2px solid var(--color-accent)',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <p
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          ICP : {criteria.roles.join(', ') || '—'}
          {criteria.locations.length > 0 && (
            <>
              <span style={{ color: 'var(--color-muted)', fontWeight: 400, margin: '0 8px' }}>·</span>
              {criteria.locations.join(', ')}
            </>
          )}
        </p>
        {result && (
          <p
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--color-success)',
              marginTop: 2,
              letterSpacing: '0.02em',
            }}
          >
            ✓ {result.count} prospects trouvés et enrichis
          </p>
        )}
        {error && (
          <p style={{ fontSize: 11, color: 'var(--color-error)', marginTop: 2 }}>{error}</p>
        )}
      </div>
      <div className="flex items-center" style={{ gap: 8, flexShrink: 0 }}>
        <button
          onClick={handleClear}
          disabled={clearing || loading}
          title="Supprimer tous les prospects existants"
          className="flex items-center gap-1.5 transition-colors disabled:opacity-40"
          style={{
            padding: '7px 12px',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--color-muted)',
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: 2,
            cursor: clearing || loading ? 'not-allowed' : 'pointer',
          }}
          onMouseEnter={e => {
            if (clearing || loading) return
            e.currentTarget.style.color = 'var(--color-error)'
            e.currentTarget.style.borderColor = 'var(--color-error)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--color-muted)'
            e.currentTarget.style.borderColor = 'var(--color-border)'
          }}
        >
          {clearing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          Vider
        </button>
        <button
          onClick={handleSearch}
          disabled={loading || clearing}
          className="flex items-center gap-2 transition-opacity disabled:opacity-40"
          style={{
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            color: '#fff',
            background: 'var(--color-accent)',
            border: 'none',
            borderRadius: 2,
            cursor: loading || clearing ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          {loading ? 'Recherche…' : 'Lancer la recherche'}
        </button>
      </div>
    </div>
  )
}
