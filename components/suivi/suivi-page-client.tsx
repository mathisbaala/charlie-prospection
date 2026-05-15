'use client'
import { useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { PipelineClient } from '@/components/prospects/pipeline-client'
import { PersonaOverviewCards } from './persona-overview-cards'
import type { Icp, Prospect } from '@/lib/types'

interface Props {
  personas: Icp[]
  prospects: Prospect[]
  /** Map persona_id → signal count (last 7 days), computed server-side.
   *  Special key '__orphan__' captures signals on prospects with no icp_id. */
  signalsByPersona: Record<string, number>
}

const ORPHAN_TAB_ID = '__orphan__'

/**
 * /suivi tab content. Groups prospects by icp_id (persona) and renders the
 * existing PipelineClient inside a tab per persona. Prospects without an
 * icp_id end up under a "Sans cible" tab so they're still actionable.
 */
export function SuiviPageClient({ personas, prospects, signalsByPersona }: Props) {
  const searchParams = useSearchParams()
  const initialPersona = searchParams.get('persona')

  // Group prospects: personaId → prospects[]
  const grouped = useMemo(() => {
    const map = new Map<string, Prospect[]>()
    for (const p of prospects) {
      const key = p.icp_id ?? ORPHAN_TAB_ID
      const arr = map.get(key) ?? []
      arr.push(p)
      map.set(key, arr)
    }
    return map
  }, [prospects])

  // Tabs to display: only personas that have prospects, plus orphans tab if any.
  const tabs = useMemo(() => {
    const out: Array<{ id: string; name: string; count: number }> = []
    for (const persona of personas) {
      const count = grouped.get(persona.id)?.length ?? 0
      if (count > 0) out.push({ id: persona.id, name: persona.name, count })
    }
    const orphanCount = grouped.get(ORPHAN_TAB_ID)?.length ?? 0
    if (orphanCount > 0) out.push({ id: ORPHAN_TAB_ID, name: 'Sans cible', count: orphanCount })
    return out
  }, [personas, grouped])

  // Per-persona overview summaries (same set of tabs, with stats decoration).
  const summaries = useMemo(() => {
    return tabs.map((t) => ({
      id: t.id,
      name: t.name,
      prospects: grouped.get(t.id) ?? [],
      signals7d:
        t.id === ORPHAN_TAB_ID
          ? (signalsByPersona.__orphan__ ?? 0)
          : (signalsByPersona[t.id] ?? 0),
    }))
  }, [tabs, grouped, signalsByPersona])

  // Default selected tab — honor ?persona=, else first tab.
  const [selectedTab, setSelectedTab] = useState<string>(
    initialPersona && tabs.find((t) => t.id === initialPersona) ? initialPersona : tabs[0]?.id ?? '',
  )

  if (tabs.length === 0) {
    return (
      <div style={{ padding: '40px 32px', maxWidth: 720, margin: '0 auto' }}>
        <h1
          className="font-display"
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: 'var(--color-text)',
            letterSpacing: '-0.02em',
            marginBottom: 8,
          }}
        >
          Suivi
        </h1>
        <p style={{ fontSize: 14, color: 'var(--color-muted)' }}>
          Aucun prospect en suivi. Va dans{' '}
          <a href="/recherche" style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>
            Recherche
          </a>{' '}
          pour ajouter tes premiers prospects.
        </p>
      </div>
    )
  }

  const currentProspects = grouped.get(selectedTab) ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 60px)' }}>
      {/* Per-persona overview cards (above tabs) */}
      <PersonaOverviewCards
        summaries={summaries}
        selectedId={selectedTab}
        onSelect={setSelectedTab}
      />

      {/* Persona tabs row */}
      {tabs.length > 1 && (
        <nav
          style={{
            display: 'flex',
            gap: 0,
            padding: '0 32px',
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            overflowX: 'auto',
          }}
        >
          {tabs.map((t) => {
            const active = t.id === selectedTab
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTab(t.id)}
                style={{
                  padding: '14px 18px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: active
                    ? '2px solid var(--color-accent)'
                    : '2px solid transparent',
                  color: active ? 'var(--color-accent)' : 'var(--color-muted)',
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {t.name}
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--color-muted)',
                    background: 'var(--color-bg)',
                    padding: '2px 6px',
                    borderRadius: 2,
                    fontFamily: 'var(--font-mono, monospace)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {t.count}
                </span>
              </button>
            )
          })}
        </nav>
      )}

      {/* The existing PipelineClient — reused as-is. The persona-scoped slice
          of prospects is passed via initialProspects. The key forces a clean
          remount when switching personas (so the selected prospect state
          doesn't leak across groups). */}
      <PipelineClient key={selectedTab} initialProspects={currentProspects} />
    </div>
  )
}
