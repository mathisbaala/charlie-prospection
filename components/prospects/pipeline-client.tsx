'use client'
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { PipelineDetailPanel } from './pipeline-detail-panel'
import { titleCase, euros } from './_shared'
import type { Prospect, ProspectEnrichmentData } from '@/lib/types'

const STAGE_LABELS: Record<string, string> = {
  new: 'Nouveau',
  to_contact: 'À contacter',
  contacted: 'Contacté',
  meeting: 'RDV',
  client: 'Client',
  lost: 'Perdu',
}

interface Props {
  initialProspects: Prospect[]
}

/**
 * Pipeline landing — two-panel split: a 280px list on the left, a flexible
 * detail panel on the right. The list is filterable client-side by person
 * name, company, or city. Selecting a row populates the right panel.
 */
export function PipelineClient({ initialProspects }: Props) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(
    initialProspects[0]?.id ?? null,
  )

  // Precompute the searchable haystack per prospect (cheap, ~50 rows).
  const rows = useMemo(
    () =>
      initialProspects.map(p => {
        const ld = p.linkedin_data as Record<string, string>
        const ed = p.enrichment_data as ProspectEnrichmentData
        const prenom = ed?.dirigeant_prenom ?? ld?.prenom ?? ''
        const nom = ed?.dirigeant_nom ?? ld?.nom_de_famille ?? ''
        const personName = `${titleCase(prenom)} ${titleCase(nom)}`.trim() || 'Prospect'
        const companyName = ld?.entreprise ?? ed?.libelle_naf ?? ''
        const ville = ed?.ville ?? ''
        const ca = ed?.chiffre_affaires_dernier
        const stage = p.crm_stage
        const haystack = `${personName} ${companyName} ${ville}`.toLowerCase()
        return { prospect: p, personName, companyName, ville, ca, stage, haystack }
      }),
    [initialProspects],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => r.haystack.includes(q))
  }, [rows, query])

  const selected =
    initialProspects.find(p => p.id === selectedId) ?? filtered[0]?.prospect ?? null

  // Empty pipeline (no prospects in DB at all)
  if (initialProspects.length === 0) {
    return (
      <div
        className="flex flex-col"
        style={{ minHeight: '100vh', background: 'var(--color-bg)' }}
      >
        <TopBar query={query} onQuery={setQuery} disabled />
        <EmptyState />
      </div>
    )
  }

  return (
    <div
      className="flex flex-col"
      style={{ height: '100vh', background: 'var(--color-bg)' }}
    >
      <TopBar query={query} onQuery={setQuery} disabled={false} />

      <div className="flex-1 flex" style={{ minHeight: 0 }}>
        {/* ── LEFT: list ───────────────────────────────────────────── */}
        <aside
          style={{
            width: 280,
            flexShrink: 0,
            background: 'var(--color-surface)',
            borderRight: '1px solid var(--color-border)',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              padding: '14px 16px 12px 16px',
              borderBottom: '1px solid var(--color-border)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-muted)',
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <span>Pipeline</span>
            <span
              className="font-mono"
              style={{
                fontSize: 10,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.04em',
              }}
            >
              {filtered.length}/{rows.length}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div
              style={{
                padding: '24px 16px',
                fontSize: 12,
                color: 'var(--color-muted)',
                textAlign: 'center',
              }}
            >
              Aucun prospect ne correspond à «&nbsp;{query}&nbsp;».
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {filtered.map(({ prospect, personName, companyName, ville, ca, stage }) => {
                const active = prospect.id === selected?.id
                return (
                  <li key={prospect.id}>
                    <button
                      onClick={() => setSelectedId(prospect.id)}
                      className="w-full text-left transition-colors"
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '12px 14px 12px 14px',
                        background: active ? 'var(--color-accent-dim)' : 'transparent',
                        borderLeft: active
                          ? '2px solid var(--color-accent)'
                          : '2px solid transparent',
                        borderBottom: '1px solid var(--color-border)',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={e => {
                        if (!active)
                          e.currentTarget.style.background = 'var(--color-accent-dim)'
                      }}
                      onMouseLeave={e => {
                        if (!active) e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <div
                        className="flex items-start justify-between"
                        style={{ gap: 8 }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: 'var(--color-text)',
                              letterSpacing: '-0.005em',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {personName}
                          </p>
                          <p
                            style={{
                              fontSize: 11,
                              color: 'var(--color-muted)',
                              marginTop: 2,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {titleCase(companyName) || '—'}
                            {ville ? ` · ${titleCase(ville)}` : ''}
                          </p>
                        </div>
                      </div>
                      <div
                        className="flex items-center"
                        style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}
                      >
                        <span
                          className="font-mono"
                          style={{
                            display: 'inline-flex',
                            padding: '1px 6px',
                            fontSize: 10,
                            fontWeight: 600,
                            background: 'var(--color-bg)',
                            color: ca ? 'var(--color-text)' : 'var(--color-muted)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 2,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {ca ? `CA ${euros(ca)}` : 'CA —'}
                        </span>
                        <span
                          style={{
                            display: 'inline-flex',
                            padding: '1px 6px',
                            fontSize: 10,
                            fontWeight: 600,
                            borderRadius: 2,
                            ...stageBadgeStyle(stage),
                          }}
                        >
                          {STAGE_LABELS[stage] ?? stage}
                        </span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        {/* ── RIGHT: detail panel ─────────────────────────────────── */}
        {selected ? (
          <PipelineDetailPanel key={selected.id} prospect={selected} />
        ) : (
          <div
            className="flex-1 flex items-center justify-center"
            style={{ background: 'var(--color-surface)' }}
          >
            <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
              Sélectionnez un prospect dans la liste.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Top bar (wordmark + search) ──────────────────────────────────────

function TopBar({
  query,
  onQuery,
  disabled,
}: {
  query: string
  onQuery: (q: string) => void
  disabled: boolean
}) {
  return (
    <header
      className="flex items-center"
      style={{
        gap: 24,
        padding: '14px 24px',
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
      }}
    >
      {/* Wordmark: C ● Charlie · Prospection */}
      <div className="flex items-center" style={{ gap: 8, flexShrink: 0 }}>
        <span
          className="font-display"
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--color-text)',
            letterSpacing: '-0.01em',
          }}
        >
          C
        </span>
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--color-accent)',
            display: 'inline-block',
          }}
        />
        <span
          className="font-display"
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--color-text)',
            letterSpacing: '-0.01em',
          }}
        >
          Charlie
        </span>
        <span style={{ color: 'var(--color-muted)', fontWeight: 300 }}>·</span>
        <span style={{ color: 'var(--color-muted)', fontSize: 13 }}>Prospection</span>
      </div>

      {/* Search */}
      <div
        className="flex items-center"
        style={{
          gap: 8,
          flex: 1,
          maxWidth: 480,
          padding: '7px 12px',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 2,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Search size={14} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
        <input
          type="search"
          value={query}
          onChange={e => onQuery(e.target.value)}
          disabled={disabled}
          placeholder="Filtrer par nom, société, ville…"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: 13,
            color: 'var(--color-text)',
            fontFamily: 'inherit',
          }}
          aria-label="Filtrer le pipeline"
        />
      </div>
    </header>
  )
}

// ── Empty state ──────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center"
      style={{ background: 'var(--color-surface)', padding: 48, textAlign: 'center' }}
    >
      <p
        className="font-display"
        style={{
          fontSize: 24,
          fontWeight: 600,
          color: 'var(--color-text)',
          letterSpacing: '-0.01em',
        }}
      >
        Aucun prospect dans le pipeline
      </p>
      <p
        style={{
          marginTop: 8,
          fontSize: 13,
          color: 'var(--color-muted)',
          maxWidth: 420,
        }}
      >
        Lancez une recherche depuis la page Recherche pour commencer.
      </p>
    </div>
  )
}

// ── Stage badge style helper ────────────────────────────────────────

function stageBadgeStyle(stage: string): React.CSSProperties {
  const accent = ['contacted', 'meeting', 'client'].includes(stage)
  if (accent) {
    return {
      background: 'var(--color-accent-dim)',
      color: 'var(--color-accent)',
      border: '1px solid var(--color-accent)',
    }
  }
  if (stage === 'lost') {
    return {
      background: 'var(--color-bg)',
      color: 'var(--color-muted)',
      border: '1px solid var(--color-border)',
    }
  }
  return {
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
  }
}
