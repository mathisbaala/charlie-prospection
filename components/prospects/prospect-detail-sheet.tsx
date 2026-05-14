'use client'
import { Building2, MapPin, Stethoscope, User } from 'lucide-react'
import { PatrimonyScoreBadge } from './patrimony-score-badge'
import { ProspectFicheContent } from './prospect-fiche-content'
import { titleCase } from './_shared'
import type { Prospect, ProspectEnrichmentData } from '@/lib/types'

const CRM_STAGES = ['new', 'to_contact', 'contacted', 'meeting', 'client', 'lost'] as const
const CRM_LABELS: Record<string, string> = {
  new: 'Nouveau',
  to_contact: 'À contacter',
  contacted: 'Contacté',
  meeting: 'RDV',
  client: 'Client',
  lost: 'Perdu',
}

interface Props {
  prospect: Prospect
  onClose: () => void
  onStageChange: (stage: string) => void
}

export function ProspectDetailSheet({ prospect, onClose, onStageChange }: Props) {
  const ld = prospect.linkedin_data as Record<string, string>
  const ed = prospect.enrichment_data as ProspectEnrichmentData

  const prenom = ed?.dirigeant_prenom ?? ld?.prenom ?? ''
  const nom = ed?.dirigeant_nom ?? ld?.nom_de_famille ?? ''
  const personName = `${titleCase(prenom)} ${titleCase(nom)}`.trim() || 'Prospect'
  const personRole = ed?.dirigeant_qualite ?? ld?.titre ?? '—'
  const companyName = ld?.entreprise ?? ed?.libelle_naf ?? '—'

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: 'rgba(26, 22, 18, 0.32)' }}
      onClick={onClose}
    >
      <div
        className="h-full overflow-y-auto flex flex-col"
        style={{
          width: 520,
          background: 'var(--color-surface)',
          borderLeft: '1px solid var(--color-border)',
          boxShadow: '-12px 0 32px rgba(26, 22, 18, 0.08)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── HEADER — score-as-hero per DESIGN.md ───────────────────── */}
        <div
          style={{
            padding: '22px 24px',
            background: 'var(--color-bg)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div className="flex items-start justify-between" style={{ marginBottom: 16 }}>
            <button
              onClick={onClose}
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--color-muted)',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-muted)')}
            >
              ✕ Fermer
            </button>
            <PatrimonyScoreBadge score={prospect.patrimony_score ?? null} size="md" />
          </div>

          {/* Type tag */}
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: ed?.rpps ? 'var(--color-accent)' : 'var(--color-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 8,
            }}
          >
            {ed?.rpps ? (
              <>
                <Stethoscope size={11} />
                Professionnel de santé
              </>
            ) : (
              <>
                <User size={11} />
                Dirigeant
              </>
            )}
          </p>

          {/* Score-as-hero: large patrimony number BEFORE the name */}
          {prospect.patrimony_score != null && (
            <p
              className="font-display"
              style={{
                fontSize: 56,
                fontWeight: 800,
                color: 'var(--color-accent)',
                lineHeight: 1,
                letterSpacing: '-0.02em',
                fontVariantNumeric: 'tabular-nums',
                marginBottom: 4,
              }}
            >
              {prospect.patrimony_score}
            </p>
          )}

          <h2
            className="font-display"
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: 'var(--color-text)',
              letterSpacing: '-0.01em',
              lineHeight: 1.15,
            }}
          >
            {personName}
          </h2>
          <p style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 4 }}>
            {personRole}
          </p>
          <div
            className="flex items-center"
            style={{ gap: 16, marginTop: 10, fontSize: 12, color: 'var(--color-muted)' }}
          >
            <span className="flex items-center" style={{ gap: 4 }}>
              <Building2 size={12} />
              {titleCase(companyName)}
            </span>
            {ed?.ville && (
              <span className="flex items-center" style={{ gap: 4 }}>
                <MapPin size={12} />
                {titleCase(ed.ville)}
              </span>
            )}
          </div>

          {/* CRM Stage selector */}
          <div className="flex flex-wrap" style={{ gap: 4, marginTop: 16 }}>
            {CRM_STAGES.map(stage => {
              const active = prospect.crm_stage === stage
              return (
                <button
                  key={stage}
                  onClick={() => onStageChange(stage)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 2,
                    border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    background: active ? 'var(--color-accent)' : 'transparent',
                    color: active ? '#fff' : 'var(--color-muted)',
                    cursor: 'pointer',
                    transition: 'all 80ms ease-out',
                  }}
                  onMouseEnter={e => {
                    if (active) return
                    e.currentTarget.style.color = 'var(--color-text)'
                    e.currentTarget.style.borderColor = 'var(--color-text)'
                  }}
                  onMouseLeave={e => {
                    if (active) return
                    e.currentTarget.style.color = 'var(--color-muted)'
                    e.currentTarget.style.borderColor = 'var(--color-border)'
                  }}
                >
                  {CRM_LABELS[stage]}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── BODY — shared sections ────────────────────────────────── */}
        <div style={{ padding: 24 }}>
          <ProspectFicheContent prospect={prospect} />
        </div>
      </div>
    </div>
  )
}
