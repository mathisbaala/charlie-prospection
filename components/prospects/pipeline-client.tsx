'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { PipelineDetailPanel } from './pipeline-detail-panel'
import { titleCase, euros } from './_shared'
import type { CrmStage, Prospect, ProspectEnrichmentData } from '@/lib/types'

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
  const [prospects, setProspects] = useState<Prospect[]>(initialProspects)
  const [selectedId, setSelectedId] = useState<string | null>(
    initialProspects[0]?.id ?? null,
  )

  // Precompute the searchable haystack per prospect (cheap, ~50 rows).
  const rows = useMemo(
    () =>
      prospects.map(p => {
        const ld = p.linkedin_data as Record<string, string>
        const ed = p.enrichment_data as ProspectEnrichmentData
        const prenom = ed?.dirigeant_prenom ?? ld?.prenom ?? ''
        const nom = ed?.dirigeant_nom ?? ld?.nom_de_famille ?? ''
        const personName = `${titleCase(prenom)} ${titleCase(nom)}`.trim() || 'Prospect'
        const companyName = ld?.entreprise ?? ed?.libelle_naf ?? ''
        const ville = ed?.ville ?? ''
        const profession = ed?.dirigeant_qualite ?? ed?.libelle_naf ?? ''
        const stage = p.crm_stage
        const score = p.patrimony_score
        return { prospect: p, personName, companyName, ville, profession, stage, score }
      }),
    [prospects],
  )

  const selected = prospects.find(p => p.id === selectedId) ?? prospects[0] ?? null

  async function handleStageChange(stage: CrmStage) {
    if (!selected) return
    const previousStage = selected.crm_stage
    // Optimistic update
    setProspects(prev =>
      prev.map(p => (p.id === selected.id ? { ...p, crm_stage: stage } : p)),
    )
    try {
      const res = await fetch(`/api/prospects/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crm_stage: stage }),
      })
      if (!res.ok) throw new Error('PATCH failed')
    } catch {
      // Rollback on failure
      setProspects(prev =>
        prev.map(p =>
          p.id === selected.id ? { ...p, crm_stage: previousStage } : p,
        ),
      )
    }
  }

  async function handleDelete() {
    if (!selected) return
    const displayName =
      `${(selected.linkedin_data as { prenom?: string } | null)?.prenom ?? ''} ${(selected.linkedin_data as { nom_de_famille?: string } | null)?.nom_de_famille ?? ''}`.trim() ||
      'ce prospect'
    if (!confirm(`Supprimer ${displayName} du suivi ? Les signaux associés seront aussi supprimés.`)) {
      return
    }
    const prospectId = selected.id
    // Optimistic remove
    setProspects(prev => prev.filter(p => p.id !== prospectId))
    setSelectedId(null)
    try {
      const res = await fetch(`/api/prospects/${prospectId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('DELETE failed')
    } catch {
      // Rollback: refetch via parent — easiest is router.refresh() which the
      // server component re-fetches. Since we don't have router here, we
      // refresh the page so the deletion is visible/reverted consistently.
      window.location.reload()
    }
  }

  // Empty pipeline (no prospects in DB at all)
  if (initialProspects.length === 0) {
    return (
      <div
        className="flex flex-col"
        style={{ minHeight: '100vh', background: 'var(--color-bg)' }}
      >
        <EmptyState />
      </div>
    )
  }

  return (
    <div
      className="flex flex-col"
      style={{ height: '100vh', background: 'var(--color-bg)' }}
    >
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
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {rows.map(({ prospect, personName, companyName, ville, profession, stage, score }) => {
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
                        style={{ gap: 10 }}
                      >
                        {/* Score-as-hero: copper Fraunces before the name (DESIGN.md) */}
                        <span
                          className="font-display"
                          style={{
                            flexShrink: 0,
                            fontSize: 22,
                            fontWeight: 800,
                            lineHeight: 1,
                            letterSpacing: '-0.02em',
                            color: score != null && score >= 60 ? 'var(--color-accent)' : 'var(--color-muted)',
                            fontVariantNumeric: 'tabular-nums',
                            width: 32,
                          }}
                        >
                          {score ?? '—'}
                        </span>
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
                        style={{ gap: 6, marginTop: 6, marginLeft: 42, flexWrap: 'wrap' }}
                      >
                        {profession && (
                          <span
                            style={{
                              fontSize: 10,
                              color: 'var(--color-muted)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 140,
                            }}
                          >
                            {profession}
                          </span>
                        )}
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
        </aside>

        {/* ── RIGHT: detail panel ─────────────────────────────────── */}
        {selected ? (
          <PipelineDetailPanel
            key={selected.id}
            prospect={selected}
            onStageChange={handleStageChange}
            onDelete={handleDelete}
          />
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
        Aucun prospect dans le suivi
      </p>
      <p
        style={{
          marginTop: 8,
          fontSize: 13,
          color: 'var(--color-muted)',
          maxWidth: 420,
        }}
      >
        Lancez votre première recherche pour identifier les prospects qui correspondent à votre cible.
      </p>
      <Link
        href="/"
        style={{
          marginTop: 20,
          display: 'inline-block',
          padding: '10px 20px',
          background: 'var(--color-text)',
          color: 'var(--color-bg)',
          fontSize: 13,
          fontWeight: 600,
          textDecoration: 'none',
          borderRadius: 2,
          letterSpacing: '0.01em',
        }}
      >
        Lancer une recherche
      </Link>
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
