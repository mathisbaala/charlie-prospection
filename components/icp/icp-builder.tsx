'use client'
import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { CriteriaTags } from './criteria-tags'
import type { Icp, ParsedIcpCriteria } from '@/lib/types'

const EXAMPLES = [
  'Médecins généralistes installés depuis moins de 5 ans en Île-de-France',
  'Dirigeants de startup tech Series A ou B, basés à Paris ou Lyon',
  'Avocats associés dans des cabinets de 10+ personnes en France',
]

interface Props {
  initialIcp?: Icp | null
}

export function IcpBuilder({ initialIcp }: Props) {
  const [description, setDescription] = useState(initialIcp?.raw_description ?? '')
  const [criteria, setCriteria] = useState<ParsedIcpCriteria | null>(
    initialIcp?.parsed_criteria ?? null
  )
  const [queries, setQueries] = useState<string[]>(initialIcp?.linkedin_queries ?? [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleParse() {
    if (!description.trim()) return
    setLoading(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/icp/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCriteria(data.icp.parsed_criteria)
      setQueries(data.icp.linkedin_queries)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Zone de texte principale */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Décrivez votre client idéal en langage naturel
        </label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Ex : Je cherche des médecins généralistes installés depuis moins de 5 ans en Île-de-France, avec un cabinet de groupe et une activité LinkedIn régulière..."
        />
        <div className="flex items-center justify-between mt-3">
          <div className="flex gap-2 flex-wrap">
            {EXAMPLES.map(ex => (
              <button
                key={ex}
                onClick={() => setDescription(ex)}
                className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
              >
                {ex.substring(0, 40)}…
              </button>
            ))}
          </div>
          <button
            onClick={handleParse}
            disabled={!description.trim() || loading}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {loading ? 'Analyse...' : 'Analyser avec IA'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>

      {/* Critères parsés */}
      {criteria && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-900">Critères extraits</h3>
            {saved && <span className="text-xs text-green-600 font-medium">✓ Sauvegardé</span>}
          </div>
          <CriteriaTags criteria={criteria} onChange={setCriteria} />
        </div>
      )}

      {/* Requêtes LinkedIn générées */}
      {queries.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-medium text-gray-900 mb-3">Requêtes LinkedIn générées</h3>
          <p className="text-sm text-gray-500 mb-4">
            Ces requêtes seront utilisées par l'extension Chrome pour trouver vos prospects.
          </p>
          <div className="space-y-2">
            {queries.map((q, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <span className="text-xs font-mono text-gray-400">#{i + 1}</span>
                <code className="text-sm text-gray-700 flex-1">{q}</code>
              </div>
            ))}
          </div>
          <div className="mt-4 p-4 bg-indigo-50 rounded-lg border border-indigo-100">
            <p className="text-sm text-indigo-700">
              <strong>Prochaine étape :</strong> Installez l'extension Chrome Charlie Prospection pour commencer à capturer les profils correspondants automatiquement.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
