'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { RechercheLauncher } from './recherche-launcher'
import { CandidateList } from './candidate-list'
import { BulkAddBar } from './bulk-add-bar'
import type { Icp, SearchCandidate } from '@/lib/types'

interface Props {
  personas: Icp[]
}

export function RecherchePageClient({ personas }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Honor ?persona=<id> deeplink (used by signup/login post-create flow).
  const initialPersonaId = searchParams.get('persona') ?? personas[0]?.id ?? null

  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(initialPersonaId)
  const [candidates, setCandidates] = useState<SearchCandidate[]>([])
  const [filteredCount, setFilteredCount] = useState<number>(0)
  const [filterBreakdown, setFilterBreakdown] = useState<Record<string, number>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addedSummary, setAddedSummary] = useState<string | null>(null)
  const [quotaPappers, setQuotaPappers] = useState<{ count: number; cap: number; remaining: number } | null>(null)

  async function handleLaunch() {
    if (!selectedPersonaId) return
    setLoading(true)
    setError(null)
    setAddedSummary(null)
    setCandidates([])
    setFilteredCount(0)
    setFilterBreakdown({})
    setSelected(new Set())
    try {
      const res = await fetch('/api/recherche/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona_id: selectedPersonaId,
          limit: 30,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCandidates(data.candidates ?? [])
      setFilteredCount(typeof data.filtered_count === 'number' ? data.filtered_count : 0)
      setFilterBreakdown(
        data.filter_breakdown && typeof data.filter_breakdown === 'object'
          ? (data.filter_breakdown as Record<string, number>)
          : {},
      )
      if (data.quota_pappers && typeof data.quota_pappers === 'object') {
        const q = data.quota_pappers as { count: number; cap: number; remaining: number }
        setQuotaPappers({ count: q.count, cap: q.cap, remaining: q.remaining })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  function toggle(uid: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(candidates.filter((c) => !c.already_in_suivi).map((c) => c.uid)))
  }

  function deselectAll() {
    setSelected(new Set())
  }

  async function handleAdd() {
    if (!selectedPersonaId || selected.size === 0) return
    setAdding(true)
    setError(null)
    try {
      const toAdd = candidates.filter((c) => selected.has(c.uid) && !c.already_in_suivi)
      const res = await fetch('/api/suivi/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_id: selectedPersonaId, candidates: toAdd }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const added = data.added ?? []
      const totalSignals = added.reduce(
        (sum: number, r: { signals_count: number }) => sum + (r.signals_count ?? 0),
        0,
      )
      setAddedSummary(
        `${added.length} prospect${added.length > 1 ? 's' : ''} ajouté${added.length > 1 ? 's' : ''} au suivi (+${totalSignals} signaux backfillés sur 1 an).`,
      )
      // Mark added candidates as "already in suivi" locally so the row greys out.
      const addedUids = new Set(toAdd.map((c) => c.uid))
      setCandidates((prev) =>
        prev.map((c) => (addedUids.has(c.uid) ? { ...c, already_in_suivi: true } : c)),
      )
      setSelected(new Set())
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <h1
          className="font-display"
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: 'var(--color-text)',
            letterSpacing: '-0.02em',
          }}
        >
          Recherche
        </h1>
        <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>
          Choisis une cible, lance la recherche. Tu vois les prospects enrichis, tu choisis ceux à
          ajouter au suivi.
        </p>
      </header>

      <RechercheLauncher
        personas={personas}
        selectedPersonaId={selectedPersonaId}
        onSelect={setSelectedPersonaId}
        onLaunch={handleLaunch}
        loading={loading}
        disabled={adding}
      />

      {quotaPappers && !loading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
            marginTop: -12,
            fontSize: 11,
            color: 'var(--color-muted)',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: quotaPappers.remaining > 50 ? '#22A855' : quotaPappers.remaining > 0 ? '#E09A2A' : '#E05C2A',
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          <span>
            Pappers :{' '}
            <span
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontVariantNumeric: 'tabular-nums',
                color: 'var(--color-text)',
                fontWeight: 600,
              }}
            >
              {quotaPappers.count}
            </span>
            {' / '}
            {quotaPappers.cap} crédits ce mois
            {quotaPappers.remaining <= 50 && (
              <span style={{ color: quotaPappers.remaining === 0 ? '#E05C2A' : '#E09A2A', marginLeft: 6 }}>
                ({quotaPappers.remaining === 0 ? 'quota atteint — cache uniquement' : `${quotaPappers.remaining} restants`})
              </span>
            )}
          </span>
        </div>
      )}

      {error && (
        <div
          style={{
            background: 'var(--color-error-bg, #FEE)',
            color: 'var(--color-error)',
            padding: '10px 14px',
            borderRadius: 2,
            border: '1px solid var(--color-error)',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {addedSummary && (
        <div
          style={{
            background: 'var(--color-accent-dim)',
            color: 'var(--color-text)',
            padding: '10px 14px',
            borderLeft: '2px solid var(--color-accent)',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          ✓ {addedSummary}{' '}
          <a
            href="/suivi"
            style={{ color: 'var(--color-accent)', textDecoration: 'underline', marginLeft: 4 }}
          >
            Voir le suivi →
          </a>
        </div>
      )}

      {loading && (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: 'var(--color-muted)',
            fontSize: 13,
          }}
        >
          Recherche dans la base de personnes…
        </div>
      )}

      {!loading && candidates.length === 0 && filteredCount === 0 && !error && (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            color: 'var(--color-muted)',
            fontSize: 13,
          }}
        >
          Aucun résultat encore. Lance une recherche pour voir les prospects.
        </div>
      )}

      {!loading && filteredCount > 0 && (
        <div
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderLeft: '2px solid var(--color-accent)',
            padding: '10px 14px',
            fontSize: 12,
            color: 'var(--color-muted)',
            marginBottom: 12,
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <span>
            <strong
              style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontVariantNumeric: 'tabular-nums',
                color: 'var(--color-text)',
                fontWeight: 700,
              }}
            >
              {filteredCount}
            </strong>{' '}
            prospect{filteredCount > 1 ? 's' : ''} filtré{filteredCount > 1 ? 's' : ''}{' '}
            automatiquement
          </span>
          {Object.keys(filterBreakdown).length > 0 && (
            <span style={{ opacity: 0.85 }}>
              ·{' '}
              {Object.entries(filterBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([reason, count]) => `${count} ${reason.toLowerCase()}`)
                .join(', ')}
            </span>
          )}
        </div>
      )}

      <CandidateList
        candidates={candidates}
        selected={selected}
        onToggle={toggle}
        onSelectAll={selectAll}
        onDeselectAll={deselectAll}
      />

      <BulkAddBar
        count={selected.size}
        onAdd={handleAdd}
        loading={adding}
      />
    </div>
  )
}
