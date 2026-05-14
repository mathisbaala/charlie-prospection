'use client'
import { useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import type { ParsedIcpCriteria } from '@/lib/types'

interface Props {
  criteria: ParsedIcpCriteria
  onComplete: () => void
}

export function SearchLauncher({ criteria, onComplete }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ count: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSearch() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/prospects/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ criteria, limit: 30 }),
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
      <button
        onClick={handleSearch}
        disabled={loading}
        className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        {loading ? 'Recherche en cours...' : 'Lancer la recherche'}
      </button>
    </div>
  )
}
