'use client'
import { useState } from 'react'
import { PersonaList } from './persona-list'
import { PersonaEditor } from './persona-editor'
import type { Icp } from '@/lib/types'

interface Props {
  initialPersonas: Icp[]
}

/**
 * Cible tab — list of personas on the left, editor on the right.
 * Selected persona is held in local state so the user can switch without a
 * full page reload. The list is hydrated from the server.
 */
export function CiblePageClient({ initialPersonas }: Props) {
  const [personas, setPersonas] = useState<Icp[]>(initialPersonas)
  // Start by editing the most-recently-updated persona; if none exist, force
  // the "create new" state.
  const [selectedId, setSelectedId] = useState<string | null>(
    initialPersonas.length > 0 ? initialPersonas[0].id : null,
  )

  const selected = personas.find((p) => p.id === selectedId) ?? null

  function handleSaved(updated: Icp | null) {
    if (updated === null) {
      // Deletion case — drop the persona from list, fall back to "new".
      setPersonas((prev) => prev.filter((p) => p.id !== selectedId))
      setSelectedId(null)
      return
    }
    setPersonas((prev) => {
      const idx = prev.findIndex((p) => p.id === updated.id)
      if (idx === -1) return [updated, ...prev]
      const next = [...prev]
      next[idx] = updated
      return next
    })
    setSelectedId(updated.id)
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 'calc(100vh - 60px)' }}>
      <PersonaList
        personas={personas}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onNew={() => setSelectedId(null)}
      />
      <main style={{ flex: 1, padding: '32px 40px', overflowY: 'auto' }}>
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
            {selected ? selected.name : 'Nouvelle cible'}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 4 }}>
            {selected
              ? 'Décrivez votre cible, ajustez les filtres à la main, enregistrez.'
              : "Décrivez votre cible, ajustez les filtres à la main, enregistrez."}
          </p>
        </header>
        {/* key on persona.id forces a remount on switch — cleaner than syncing
            local state with useEffect (avoids the cascading-render lint). */}
        <PersonaEditor key={selected?.id ?? 'new'} persona={selected} onSaved={handleSaved} />
      </main>
    </div>
  )
}
