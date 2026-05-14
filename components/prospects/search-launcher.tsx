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
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-indigo-900">
          ICP configuré : {criteria.roles.join(', ')} — {criteria.locations.join(', ')}
        </p>
        {result && (
          <p className="text-xs text-indigo-600 mt-0.5">
            ✓ {result.count} prospects trouvés et enrichis
          </p>
        )}
        {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleClear}
          disabled={clearing || loading}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-red-600 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
          title="Supprimer tous les prospects existants"
        >
          {clearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Vider
        </button>
        <button
          onClick={handleSearch}
          disabled={loading || clearing}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {loading ? 'Recherche en cours...' : 'Lancer la recherche'}
        </button>
      </div>
    </div>
  )
}
