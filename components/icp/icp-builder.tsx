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
  // If we hydrate from a saved ICP, show the "Sauvegardé" indicator immediately —
  // the user just returned to the page, the criteria are already persisted.
  const [saved, setSaved] = useState(!!initialIcp)

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
    <div style={{ maxWidth: 720 }} className="space-y-6">
      <Card>
        <Label>Décrivez votre client idéal en langage naturel</Label>
        <textarea
          value={description}
          onChange={e => {
            setDescription(e.target.value)
            // Description diverges from the persisted version → criteria are no longer in sync.
            if (saved) setSaved(false)
          }}
          rows={4}
          className="w-full mt-2"
          placeholder="Ex : Je cherche des médecins généralistes installés depuis moins de 5 ans en Île-de-France, avec un cabinet de groupe et une activité LinkedIn régulière…"
          style={{
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: 2,
            padding: '12px 14px',
            fontSize: 14,
            fontFamily: 'inherit',
            resize: 'none',
            outline: 'none',
            lineHeight: 1.5,
          }}
        />
        <div className="flex items-center justify-between mt-3 gap-4">
          <div className="flex gap-2 flex-wrap">
            {EXAMPLES.map(ex => (
              <button
                key={ex}
                onClick={() => setDescription(ex)}
                style={{
                  fontSize: 11,
                  color: 'var(--color-muted)',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-accent)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-muted)')}
              >
                {ex.substring(0, 38)}…
              </button>
            ))}
          </div>
          <button
            onClick={handleParse}
            disabled={!description.trim() || loading}
            className="flex items-center gap-2 transition-opacity disabled:opacity-40"
            style={{
              background: 'var(--color-accent)',
              color: '#fff',
              padding: '9px 14px',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 2,
              border: 'none',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {loading ? 'Analyse…' : 'Analyser avec IA'}
          </button>
        </div>
        {error && (
          <p className="text-sm mt-2" style={{ color: 'var(--color-error)' }}>
            {error}
          </p>
        )}
      </Card>

      {criteria && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <SectionHeading>Critères extraits</SectionHeading>
            {saved && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  color: 'var(--color-success)',
                }}
              >
                ✓ Sauvegardé
              </span>
            )}
          </div>
          <CriteriaTags criteria={criteria} onChange={c => { setCriteria(c); setSaved(false) }} />
        </Card>
      )}

      {queries.length > 0 && (
        <Card>
          <SectionHeading>Requêtes LinkedIn générées</SectionHeading>
          <p className="text-sm mt-1 mb-4" style={{ color: 'var(--color-muted)' }}>
            Ces requêtes seront utilisées par l&apos;extension Chrome pour trouver vos prospects.
          </p>
          <div className="space-y-2">
            {queries.map((q, i) => (
              <div
                key={i}
                className="flex items-center gap-3"
                style={{
                  padding: '10px 14px',
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 2,
                }}
              >
                <span
                  className="font-mono"
                  style={{ fontSize: 11, color: 'var(--color-muted)', minWidth: 20 }}
                >
                  #{i + 1}
                </span>
                <code style={{ fontSize: 13, color: 'var(--color-text)', flex: 1 }}>{q}</code>
              </div>
            ))}
          </div>
          <div
            className="mt-4"
            style={{
              padding: 14,
              background: 'var(--color-accent-dim)',
              borderLeft: '2px solid var(--color-accent)',
            }}
          >
            <p style={{ fontSize: 13, color: 'var(--color-text)' }}>
              <strong style={{ fontWeight: 600 }}>Prochaine étape :</strong> installez l&apos;extension Chrome Charlie Prospection pour commencer à capturer les profils correspondants automatiquement.
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 2,
        padding: 24,
      }}
    >
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block"
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--color-muted)',
      }}
    >
      {children}
    </label>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="font-display"
      style={{
        fontSize: 18,
        fontWeight: 600,
        color: 'var(--color-text)',
        letterSpacing: '-0.01em',
      }}
    >
      {children}
    </h3>
  )
}
