'use client'
import { useState } from 'react'
import { Building2, MapPin, Stethoscope, User, Check, Trash2 } from 'lucide-react'
import { ProspectFicheContent } from './prospect-fiche-content'
import { ProspectSignalsTimeline } from '@/components/suivi/prospect-signals-timeline'
import { ProspectActivityLog } from '@/components/suivi/prospect-activity-log'
import { titleCase } from './_shared'
import type { CrmStage, Prospect, ProspectEnrichmentData } from '@/lib/types'

type Tab = 'fiche' | 'signals' | 'interactions' | 'pipeline'

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
  onStageChange?: (stage: CrmStage) => void
  /** Called when the user removes the prospect from /suivi (DELETE button).
   *  Optional so the legacy /pipeline page (now a redirect shim) doesn't
   *  need to wire it. */
  onDelete?: () => void
}

const STAGE_PILLS: CrmStage[] = ['new', 'to_contact', 'contacted', 'meeting', 'client', 'lost']

/**
 * Inline detail panel for the pipeline split-panel view. Renders a sticky
 * dark-surface header with the patrimony score as hero (DESIGN.md
 * score-as-hero rule), CRM stage pills, two tabs (Fiche / Pipeline), and
 * either the shared `ProspectFicheContent` or a clickable stage timeline.
 */
export function PipelineDetailPanel({ prospect, onStageChange, onDelete }: Props) {
  const [tab, setTab] = useState<Tab>('fiche')

  const ld = prospect.linkedin_data as Record<string, string>
  const ed = prospect.enrichment_data as ProspectEnrichmentData

  const prenom = ed?.dirigeant_prenom ?? ld?.prenom ?? ''
  const nom = ed?.dirigeant_nom ?? ld?.nom_de_famille ?? ''
  const personName = `${titleCase(prenom)} ${titleCase(nom)}`.trim() || 'Prospect'
  const personRole = ed?.dirigeant_qualite ?? ld?.titre ?? '—'
  const companyName = ld?.entreprise ?? ed?.libelle_naf ?? '—'

  const score = prospect.patrimony_score
  const valuation = ed?.patrimoine_total_estime
  const valuationLabel =
    valuation && valuation >= 1_000_000
      ? `${(valuation / 1_000_000).toFixed(1)}M€`
      : valuation && valuation >= 1_000
        ? `${Math.round(valuation / 1_000)}K€`
        : valuation
          ? `${valuation.toLocaleString('fr-FR')}€`
          : null

  return (
    <div
      className="flex-1 flex flex-col overflow-y-auto"
      style={{ background: 'var(--color-surface)' }}
    >
      {/* ── STICKY HEADER (banque privée: name-as-hero, KPI-as-block) ── */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          background: 'var(--color-bg)',
          padding: '24px 32px 20px 32px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div className="flex items-start" style={{ gap: 24 }}>
          {/* Left column: identité de la personne (name-as-hero) */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="flex items-center justify-between"
              style={{ gap: 8, marginBottom: 8 }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  color: 'var(--color-accent)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
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
              {onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  aria-label="Supprimer ce prospect du suivi"
                  title="Retirer du suivi"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 22,
                    height: 22,
                    background: 'transparent',
                    color: 'var(--color-muted)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'color 100ms',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--color-error)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--color-muted)'
                  }}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>

            <h2
              className="font-display"
              style={{
                fontSize: 26,
                fontWeight: 600,
                color: 'var(--color-text)',
                letterSpacing: '-0.015em',
                lineHeight: 1.15,
                margin: 0,
              }}
            >
              {personName}
            </h2>

            <div
              className="flex items-center"
              style={{
                marginTop: 6,
                gap: 10,
                fontSize: 13,
                color: 'var(--color-muted)',
                flexWrap: 'wrap',
                lineHeight: 1.4,
              }}
            >
              <span>{personRole}</span>
              <span style={{ color: 'var(--color-border)' }}>·</span>
              <span className="flex items-center" style={{ gap: 4 }}>
                <Building2 size={11} />
                {titleCase(companyName)}
              </span>
              {ed?.ville && (
                <>
                  <span style={{ color: 'var(--color-border)' }}>·</span>
                  <span className="flex items-center" style={{ gap: 4 }}>
                    <MapPin size={11} />
                    {titleCase(ed.ville)}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Right column: KPI block (score + valorisation, Bloomberg-style) */}
          <div
            style={{
              flexShrink: 0,
              width: 220,
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              padding: '14px 16px',
              textAlign: 'right',
            }}
          >
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: 'var(--color-muted)',
                margin: 0,
                marginBottom: 4,
              }}
            >
              Patrimoine
            </p>
            <p
              className="font-mono"
              style={{
                fontSize: 32,
                fontWeight: 600,
                color: score != null ? 'var(--color-text)' : 'var(--color-muted)',
                lineHeight: 1,
                letterSpacing: '-0.01em',
                fontVariantNumeric: 'tabular-nums',
                margin: 0,
              }}
            >
              {score ?? '—'}
            </p>
            {valuationLabel && (
              <>
                <div
                  style={{
                    height: 1,
                    background: 'var(--color-border)',
                    margin: '10px 0 8px',
                  }}
                />
                <p
                  className="font-mono"
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--color-text)',
                    fontVariantNumeric: 'tabular-nums',
                    margin: 0,
                    lineHeight: 1.2,
                  }}
                >
                  {valuationLabel}
                  <span
                    style={{
                      fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
                      fontSize: 10,
                      fontWeight: 500,
                      color: 'var(--color-muted)',
                      marginLeft: 4,
                      letterSpacing: '0.02em',
                    }}
                  >
                    estimé
                  </span>
                </p>
              </>
            )}
          </div>
        </div>

      </div>

      {/* ── CRM STAGE SELECTOR (under header, above tabs — no border, fused with tabs) ─ */}
      {onStageChange && (
        <div
          className="flex"
          style={{
            background: 'var(--color-surface)',
            padding: '14px 32px 12px',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          {STAGE_PILLS.map(stage => {
            const active = prospect.crm_stage === stage
            return (
              <button
                key={stage}
                onClick={() => onStageChange(stage)}
                disabled={active}
                className="transition-colors"
                style={{
                  padding: '5px 11px',
                  fontSize: 11,
                  fontWeight: active ? 700 : 500,
                  letterSpacing: '0.02em',
                  borderRadius: 2,
                  cursor: active ? 'default' : 'pointer',
                  ...stagePillStyle(stage, active),
                }}
                onMouseEnter={e => {
                  if (active) return
                  e.currentTarget.style.background = 'var(--color-accent-dim)'
                  e.currentTarget.style.color = 'var(--color-accent)'
                  e.currentTarget.style.borderColor = 'var(--color-accent)'
                }}
                onMouseLeave={e => {
                  if (active) return
                  const base = stagePillStyle(stage, false)
                  e.currentTarget.style.background = base.background as string
                  e.currentTarget.style.color = base.color as string
                  e.currentTarget.style.borderColor = (base.border as string).replace(/^1px solid /, '')
                }}
              >
                {STAGE_LABELS[stage]}
              </button>
            )
          })}
        </div>
      )}

      {/* ── TABS (aligned to header content via padding offset) ───── */}
      <div
        className="flex"
        style={{
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          padding: '0 18px',
          gap: 4,
        }}
      >
        <TabButton active={tab === 'fiche'} onClick={() => setTab('fiche')}>
          Fiche
        </TabButton>
        <TabButton active={tab === 'signals'} onClick={() => setTab('signals')}>
          Signaux
        </TabButton>
        <TabButton active={tab === 'interactions'} onClick={() => setTab('interactions')}>
          Interactions
        </TabButton>
        <TabButton active={tab === 'pipeline'} onClick={() => setTab('pipeline')}>
          Pipeline
        </TabButton>
      </div>

      {/* ── TAB CONTENT ─────────────────────────────────────────── */}
      <div style={{ padding: '24px 32px 48px 32px' }}>
        {tab === 'fiche' && <ProspectFicheContent prospect={prospect} />}
        {tab === 'signals' && <ProspectSignalsTimeline prospectId={prospect.id} />}
        {tab === 'interactions' && <ProspectActivityLog prospectId={prospect.id} />}
        {tab === 'pipeline' && (
          <PipelineTimeline currentStage={prospect.crm_stage} onStageChange={onStageChange} />
        )}
      </div>
    </div>
  )
}

// Stage pill style — copper-filled when active, neutral when not
function stagePillStyle(stage: CrmStage, active: boolean): React.CSSProperties {
  if (active) {
    if (stage === 'lost') {
      return {
        background: 'var(--color-error)',
        color: '#FDFAF5',
        border: '1px solid var(--color-error)',
      }
    }
    return {
      background: 'var(--color-accent)',
      color: '#FDFAF5',
      border: '1px solid var(--color-accent)',
    }
  }
  return {
    background: 'var(--color-bg)',
    color: 'var(--color-muted)',
    border: '1px solid var(--color-border)',
  }
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
        padding: '12px 14px',
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

function PipelineTimeline({
  currentStage,
  onStageChange,
}: {
  currentStage: CrmStage
  onStageChange?: (stage: CrmStage) => void
}) {
  const isLost = currentStage === 'lost'
  const currentIndex = STAGE_ORDER.indexOf(currentStage)
  const clickable = !!onStageChange

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
        {clickable && (
          <span style={{ marginLeft: 10, fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontStyle: 'italic' }}>
            cliquez pour avancer
          </span>
        )}
      </h3>

      <ol style={{ position: 'relative', paddingLeft: 24, margin: 0, listStyle: 'none' }}>
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
          const body = (
            <>
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: -24,
                  top: 2,
                  width: 17,
                  height: 17,
                  borderRadius: '50%',
                  background: isCurrent ? 'var(--color-accent)' : 'var(--color-surface)',
                  border: `2px solid ${isCurrent || isPast ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isCurrent ? '#FDFAF5' : 'var(--color-accent)',
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
              <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>
                {STAGE_HINTS[stage]}
              </p>
            </>
          )
          return (
            <li
              key={stage}
              style={{ position: 'relative', paddingBottom: idx === STAGE_ORDER.length - 1 ? 0 : 22 }}
            >
              {clickable && !isCurrent ? (
                <button
                  onClick={() => onStageChange(stage)}
                  className="text-left w-full transition-colors"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                >
                  {body}
                </button>
              ) : (
                body
              )}
            </li>
          )
        })}
      </ol>

      {/* "Lost" action as a separate row outside the linear progression */}
      {clickable && !isLost && (
        <button
          onClick={() => onStageChange('lost')}
          className="transition-colors"
          style={{
            marginTop: 24,
            padding: '6px 12px',
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--color-muted)',
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: 2,
            cursor: 'pointer',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'var(--color-error)'
            e.currentTarget.style.borderColor = 'var(--color-error)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--color-muted)'
            e.currentTarget.style.borderColor = 'var(--color-border)'
          }}
        >
          Marquer comme perdu
        </button>
      )}

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
    </div>
  )
}
