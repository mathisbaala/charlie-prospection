'use client'
import { useState, useEffect } from 'react'
import { Search, Check } from 'lucide-react'
import type { Prospect, ProspectEnrichmentData } from '@/lib/types'

interface Props {
  selected: string[]
  onChange: (ids: string[]) => void
}

function getProspectName(p: Prospect): string {
  const e = p.enrichment_data as ProspectEnrichmentData
  const ld = p.linkedin_data as Record<string, unknown>
  const prenom = String(e?.dirigeant_prenom ?? ld?.prenom ?? '').trim()
  const nom = String(e?.dirigeant_nom ?? ld?.nom ?? '').trim()
  return [prenom, nom].filter(Boolean).join(' ') || p.linkedin_url
}

function getProspectCompany(p: Prospect): string {
  const e = p.enrichment_data as ProspectEnrichmentData & Record<string, unknown>
  return String(e?.entreprise_nom ?? '').trim()
}

function getProspectCity(p: Prospect): string {
  const e = p.enrichment_data as ProspectEnrichmentData
  return String(e?.ville ?? '').trim()
}

export function ProspectSelector({ selected, onChange }: Props) {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/prospects/for-outreach')
      .then(r => r.json())
      .then(d => setProspects(d.prospects ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = prospects.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    const name = getProspectName(p).toLowerCase()
    const company = getProspectCompany(p).toLowerCase()
    return name.includes(q) || company.includes(q)
  })

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id])
  }

  function toggleAll() {
    if (selected.length === filtered.length) onChange([])
    else onChange(filtered.map(p => p.id))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>
          {selected.length > 0
            ? `${selected.length} / ${filtered.length} sélectionné${selected.length > 1 ? 's' : ''}`
            : `${prospects.length} prospects dans le suivi`}
        </span>
        {filtered.length > 0 && (
          <button
            onClick={toggleAll}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: selected.length === filtered.length ? 'var(--color-muted)' : '#fff',
              background: selected.length === filtered.length ? 'transparent' : 'var(--color-accent)',
              border: `1px solid ${selected.length === filtered.length ? 'var(--color-border)' : 'var(--color-accent)'}`,
              cursor: 'pointer',
              padding: '5px 14px',
              flexShrink: 0,
            }}
          >
            {selected.length === filtered.length ? 'Tout désélectionner' : `Tout sélectionner (${filtered.length})`}
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search
          size={13}
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--color-muted)',
          }}
        />
        <input
          type="text"
          placeholder="Rechercher par nom ou entreprise…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px 8px 30px',
            fontSize: 13,
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
          }}
        />
      </div>

      {/* Liste */}
      <div
        style={{
          border: '1px solid var(--color-border)',
          maxHeight: 320,
          overflowY: 'auto',
          background: 'var(--color-surface)',
        }}
      >
        {loading && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
            Chargement…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-muted)', fontSize: 13 }}>
            {search ? 'Aucun résultat' : 'Aucun prospect dans le suivi'}
          </div>
        )}

        {filtered.map((p, idx) => {
          const isSel = selected.includes(p.id)
          const name = getProspectName(p)
          const company = getProspectCompany(p)
          const city = getProspectCity(p)

          return (
            <div
              key={p.id}
              onClick={() => toggle(p.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                borderBottom: idx < filtered.length - 1 ? '1px solid var(--color-border)' : 'none',
                background: isSel ? 'var(--color-accent-dim)' : 'transparent',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,0,0,0.02)' }}
              onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
            >
              {/* Checkbox */}
              <div
                style={{
                  width: 16,
                  height: 16,
                  border: `1px solid ${isSel ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  background: isSel ? 'var(--color-accent)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {isSel && <Check size={10} color="#fff" strokeWidth={3} />}
              </div>

              {/* Score */}
              {p.patrimony_score != null && (
                <span
                  className="font-mono"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--color-accent)',
                    minWidth: 28,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {p.patrimony_score}
                </span>
              )}

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 1 }}>
                  {[company, city].filter(Boolean).join(' · ')}
                </div>
              </div>

              {/* CRM stage */}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: 'var(--color-muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.crm_stage}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
