'use client'
import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { RechercheLauncher } from './recherche-launcher'
import { CandidateList } from './candidate-list'
import { BulkAddBar } from './bulk-add-bar'
import { SearchHistoryPanel } from './search-history-panel'
import { useRecherche } from '@/lib/recherche/context'
import type { Icp } from '@/lib/types'

interface Props {
  personas: Icp[]
}

export function RecherchePageClient({ personas }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const {
    selectedPersonaId, setSelectedPersonaId,
    candidates, setCandidates,
    filteredCount, setFilteredCount,
    filterBreakdown, setFilterBreakdown,
    selected, setSelected,
    loading, setLoading,
    adding, setAdding,
    error, setError,
    addedSummary, setAddedSummary,
    setQuotaPappers,
    history, addToHistory, restoreFromHistory,
  } = useRecherche()

  // Initialise le persona sélectionné une seule fois au montage.
  // Un ?persona= URL param prend toujours le dessus (deeplink post-création).
  // Si le context a déjà une valeur (retour d'un autre onglet), on la conserve.
  useEffect(() => {
    const urlPersona = searchParams.get('persona')
    if (urlPersona) {
      setSelectedPersonaId(urlPersona)
    } else if (selectedPersonaId === null) {
      setSelectedPersonaId(personas[0]?.id ?? null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        body: JSON.stringify({ persona_id: selectedPersonaId, limit: 30 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const newCandidates = data.candidates ?? []
      const newFilteredCount = typeof data.filtered_count === 'number' ? data.filtered_count : 0
      const newFilterBreakdown =
        data.filter_breakdown && typeof data.filter_breakdown === 'object'
          ? (data.filter_breakdown as Record<string, number>)
          : {}
      const newQuota =
        data.quota_pappers && typeof data.quota_pappers === 'object'
          ? (data.quota_pappers as { count: number; cap: number; remaining: number })
          : null

      setCandidates(newCandidates)
      setFilteredCount(newFilteredCount)
      setFilterBreakdown(newFilterBreakdown)
      if (newQuota) setQuotaPappers(newQuota)

      // Sauvegarder dans l'historique
      const persona = personas.find((p) => p.id === selectedPersonaId)
      addToHistory({
        personaId: selectedPersonaId,
        personaName: persona?.name ?? selectedPersonaId,
        candidateCount: newCandidates.length,
        candidates: newCandidates,
        filteredCount: newFilteredCount,
        filterBreakdown: newFilterBreakdown,
        quotaPappers: newQuota,
      })
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
          style={{ fontSize: 28, fontWeight: 600, color: 'var(--color-text)', letterSpacing: '-0.02em' }}
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

      <SearchHistoryPanel history={history} onRestore={restoreFromHistory} />

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
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
          Recherche dans la base de personnes…
        </div>
      )}

      {!loading && candidates.length === 0 && filteredCount === 0 && !error && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
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

      <BulkAddBar count={selected.size} onAdd={handleAdd} loading={adding} />
    </div>
  )
}
