'use client'
import { useState } from 'react'
import { Building2, MapPin, Stethoscope, User, Check } from 'lucide-react'
import { ProspectFicheContent } from './prospect-fiche-content'
import { titleCase } from './_shared'
import type { CrmStage, Prospect, ProspectEnrichmentData } from '@/lib/types'

type Tab = 'fiche' | 'pipeline'

// Stage history order — `lost` is intentionally excluded from the timeline
// (it's a terminal "out" state, not part of forward progression).
const STAGE_ORDER: CrmStage[] = ['new', 'to_contact', 'contacted', 'meeting', 'client']

const STAGE_LABELS: Record<CrmStage, string> = {
  new: 'Nouveau',
  to_contact: 'À contacter',
  contacted: 'Contacté',
  meeting: 'RDV',
  client: 'Client',
  lost: 'Perdu',
}

const STAGE_HINTS: Record<CrmStage, string> = {
  new: 'Prospect détecté par la recherche',
  to_contact: 'Marqué pour outreach',
  contacted: 'Premier message envoyé',
  meeting: 'Rendez-vous planifié',
  client: 'Engagé en mission',
  lost: 'Sorti du pipeline',
}

interface Props {
  prospect: Prospect
}

/**
 * Inline detail panel for the pipeline split-panel view. Renders a sticky
 * dark-surface valuation header, two tabs (Fiche / Pipeline), and either
 * the shared `ProspectFicheContent` or a CRM stage timeline stub.
 */
export function PipelineDetailPanel({ prospect }: Props) {
  const [tab, setTab] = useState<Tab>('fiche')

  const ld = prospect.linkedin_data as Record<string, string>
  const ed = prospect.enrichment_data as ProspectEnrichmentData

  const prenom = ed?.dirigeant_prenom ?? ld?.prenom ?? ''
  const nom = ed?.dirigeant_nom ?? ld?.nom_de_famille ?? ''
  const personName = `${titleCase(prenom)} ${titleCase(nom)}`.trim() || 'Prospect'
  const personRole = ed?.dirigeant_qualite ?? ld?.titre ?? '—'
  const companyName = ld?.entreprise ?? ed?.libelle_naf ?? '—'

  const valuation = ed?.patrimoine_total_estime
  const valuationLabel =
    valuation && valuation >= 1_000_000
      ? `${(valuation / 1_000_000).toFixed(1)}M€`
      : valuation && valuation >= 1_000
        ? `${Math.round(valuation / 1_000)}K€`
        : valuation
          ? `${valuation.toLocaleString('fr-FR')}€`
          : '—'

  return (
    <div
      className="flex-1 flex flex-col overflow-y-auto"
      style={{ background: 'var(--color-surface)' }}
    >
      {/* ── STICKY VALUATION HEADER (dark surface) ────────────────── */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          background: 'var(--color-dark-surface)',
          padding: '28px 32px 24px 32px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'rgba(237, 233, 224, 0.55)',
            marginBottom: 10,
          }}
        >
          Valorisation estimée
        </p>
        <p
          className="font-display"
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: valuation ? '#FDFAF5' : 'rgba(237, 233, 224, 0.45)',
            lineHeight: 1,
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {valuationLabel}
        </p>

        {/* Person + company strip */}
        <div
          className="flex items-center"
          style={{
            marginTop: 18,
            gap: 14,
            fontSize: 12,
            color: 'rgba(237, 233, 224, 0.65)',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-accent)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
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
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#FDFAF5',
              letterSpacing: '-0.005em',
            }}
          >
            {personName}
          </span>
          <span style={{ color: 'rgba(237, 233, 224, 0.35)' }}>·</span>
          <span>{personRole}</span>
        </div>
        <div
          className="flex items-center"
          style={{
            gap: 16,
            marginTop: 8,
            fontSize: 12,
            color: 'rgba(237, 233, 224, 0.55)',
          }}
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
      </div>

      {/* ── TABS ─────────────────────────────────────────────────── */}
      <div
        className="flex"
        style={{
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          padding: '0 32px',
          gap: 4,
        }}
      >
        <TabButton active={tab === 'fiche'} onClick={() => setTab('fiche')}>
          Fiche
        </TabButton>
        <TabButton active={tab === 'pipeline'} onClick={() => setTab('pipeline')}>
          Pipeline
        </TabButton>
      </div>

      {/* ── TAB CONTENT ─────────────────────────────────────────── */}
      <div style={{ padding: '24px 32px 48px 32px' }}>
        {tab === 'fiche' ? (
          <ProspectFicheContent prospect={prospect} />
        ) : (
          <PipelineTimeline currentStage={prospect.crm_stage} />
        )}
      </div>
    </div>
  )
}

// ── Tab button ───────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="transition-colors"
      style={{
        padding: '14px 4px',
        marginRight: 20,
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active ? 'var(--color-text)' : 'var(--color-muted)',
        background: 'transparent',
        border: 'none',
        borderBottom: active
          ? '2px solid var(--color-accent)'
          : '2px solid transparent',
        cursor: 'pointer',
        letterSpacing: '-0.005em',
      }}
      onMouseEnter={e => {
        if (!active) e.currentTarget.style.color = 'var(--color-text)'
      }}
      onMouseLeave={e => {
        if (!active) e.currentTarget.style.color = 'var(--color-muted)'
      }}
    >
      {children}
    </button>
  )
}

// ── Pipeline stage timeline stub ────────────────────────────────────

function PipelineTimeline({ currentStage }: { currentStage: CrmStage }) {
  const isLost = currentStage === 'lost'
  const currentIndex = STAGE_ORDER.indexOf(currentStage)

  return (
    <div style={{ maxWidth: 540 }}>
      <h3
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-muted)',
          marginBottom: 18,
        }}
      >
        Étapes du pipeline
      </h3>

      <ol style={{ position: 'relative', paddingLeft: 24, margin: 0 }}>
        {/* vertical rail */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 8,
            top: 6,
            bottom: 6,
            width: 1,
            background: 'var(--color-border)',
          }}
        />
        {STAGE_ORDER.map((stage, idx) => {
          const isCurrent = stage === currentStage
          const isPast = !isLost && idx < currentIndex
          const isFuture = isLost || (!isCurrent && !isPast)
          return (
            <li
              key={stage}
              style={{ position: 'relative', paddingBottom: idx === STAGE_ORDER.length - 1 ? 0 : 22 }}
            >
              {/* node */}
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: -24,
                  top: 2,
                  width: 17,
                  height: 17,
                  borderRadius: '50%',
                  background: isCurrent
                    ? 'var(--color-accent)'
                    : isPast
                      ? 'var(--color-surface)'
                      : 'var(--color-surface)',
                  border: `2px solid ${
                    isCurrent
                      ? 'var(--color-accent)'
                      : isPast
                        ? 'var(--color-accent)'
                        : 'var(--color-border)'
                  }`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isCurrent ? '#fff' : 'var(--color-accent)',
                }}
              >
                {isPast && <Check size={9} strokeWidth={3} />}
              </span>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: isCurrent ? 600 : 500,
                  color: isFuture ? 'var(--color-muted)' : 'var(--color-text)',
                  letterSpacing: '-0.005em',
                }}
              >
                {STAGE_LABELS[stage]}
                {isCurrent && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--color-accent)',
                    }}
                  >
                    Actuel
                  </span>
                )}
              </p>
              <p
                style={{
                  fontSize: 11,
                  color: 'var(--color-muted)',
                  marginTop: 2,
                }}
              >
                {STAGE_HINTS[stage]}
              </p>
            </li>
          )
        })}
      </ol>

      {isLost && (
        <div
          style={{
            marginTop: 24,
            padding: '12px 14px',
            background: 'var(--color-bg)',
            borderLeft: '2px solid var(--color-error)',
            fontSize: 12,
            color: 'var(--color-text)',
          }}
        >
          Ce prospect a été marqué comme <strong>perdu</strong>. {STAGE_HINTS.lost}.
        </div>
      )}

      <p
        style={{
          marginTop: 28,
          fontSize: 11,
          color: 'var(--color-muted)',
          fontStyle: 'italic',
        }}
      >
        L&apos;historique complet (dates, notes) sera disponible dans une prochaine version.
      </p>
    </div>
  )
}
