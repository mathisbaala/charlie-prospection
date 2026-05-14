'use client'
import { ChevronRight, Stethoscope, User } from 'lucide-react'
import { PatrimonyScoreBadge } from './patrimony-score-badge'
import { SignalBadge } from './signal-badge'
import type { Prospect, ProspectEnrichmentData, BodaccEvent } from '@/lib/types'

function LinkedinIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  )
}

const STAGE_LABELS: Record<string, string> = {
  new: 'Nouveau',
  to_contact: 'À contacter',
  contacted: 'Contacté',
  meeting: 'RDV',
  client: 'Client',
  lost: 'Perdu',
}

// Stage tier mirrors the signal-badge convention. Active CRM stages
// (engaged, meeting, client) get the copper accent; passive states stay neutral.
function stageStyle(stage: string): React.CSSProperties {
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

function euros(n: number | null | undefined): string {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M€`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K€`
  return `${n}€`
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

interface Props {
  prospects: Prospect[]
  onSelect: (prospect: Prospect) => void
}

const headerCellStyle: React.CSSProperties = {
  padding: '0 16px 10px 16px',
  textAlign: 'left',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-muted)',
  borderBottom: '1px solid var(--color-border)',
}

const cellStyle: React.CSSProperties = {
  padding: '14px 16px',
  fontSize: 13,
  color: 'var(--color-text)',
  verticalAlign: 'middle',
  borderBottom: '1px solid var(--color-border)',
}

export function ProspectTable({ prospects, onSelect }: Props) {
  if (prospects.length === 0) {
    return (
      <div
        style={{
          padding: '64px 24px',
          textAlign: 'center',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}
      >
        <p
          className="font-display"
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--color-text)',
            letterSpacing: '-0.01em',
          }}
        >
          Aucun prospect
        </p>
        <p style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 6 }}>
          Lancez une recherche depuis votre ICP pour trouver des prospects.
        </p>
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto', background: 'var(--color-surface)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...headerCellStyle, width: 32, padding: '0 4px 10px 16px' }}></th>
            <th style={headerCellStyle}>Personne</th>
            <th style={headerCellStyle}>Société</th>
            <th style={headerCellStyle}>Localisation</th>
            <th style={headerCellStyle}>CA</th>
            <th style={headerCellStyle}>Score</th>
            <th style={headerCellStyle}>Signaux</th>
            <th style={headerCellStyle}>Stage</th>
            <th style={{ ...headerCellStyle, textAlign: 'right' }}></th>
          </tr>
        </thead>
        <tbody>
          {prospects.map(prospect => {
            const ld = prospect.linkedin_data as Record<string, string>
            const ed = prospect.enrichment_data as ProspectEnrichmentData
            const stageLabel = STAGE_LABELS[prospect.crm_stage] ?? STAGE_LABELS.new
            const signals = (ed?.bodacc_events as BodaccEvent[] | undefined)
              ?.filter(e => e.type !== 'autre')
              .slice(0, 2) ?? []

            const prenom = ed?.dirigeant_prenom ?? ld?.prenom ?? ''
            const nom = ed?.dirigeant_nom ?? ld?.nom_de_famille ?? ''
            const personName = `${titleCase(prenom)} ${titleCase(nom)}`.trim() || 'Prospect'
            const personRole = ed?.dirigeant_qualite ?? ld?.titre ?? '—'
            const companyName = ld?.entreprise ?? ed?.libelle_naf ?? '—'
            const companySector = ed?.libelle_naf ?? '—'
            const isHealth = !!ed?.rpps

            return (
              <tr
                key={prospect.id}
                onClick={() => onSelect(prospect)}
                style={{ cursor: 'pointer', transition: 'background 80ms ease-out' }}
                onMouseEnter={e =>
                  (e.currentTarget.style.background = 'var(--color-accent-dim)')
                }
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ ...cellStyle, padding: '14px 4px 14px 16px' }}>
                  {isHealth ? (
                    <Stethoscope size={14} style={{ color: 'var(--color-accent)' }} />
                  ) : (
                    <User size={14} style={{ color: 'var(--color-muted)' }} />
                  )}
                </td>

                <td style={cellStyle}>
                  <p style={{ fontWeight: 600, color: 'var(--color-text)' }}>{personName}</p>
                  <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 1 }}>
                    {personRole}
                  </p>
                </td>

                <td style={cellStyle}>
                  <p style={{ color: 'var(--color-text)' }}>{titleCase(companyName)}</p>
                  <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 1 }}>
                    {companySector}
                  </p>
                </td>

                <td style={cellStyle}>
                  <p style={{ color: 'var(--color-text)' }}>{ed?.ville ? titleCase(ed.ville) : '—'}</p>
                  <p
                    className="font-mono"
                    style={{
                      fontSize: 11,
                      color: 'var(--color-muted)',
                      marginTop: 1,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {ed?.code_postal ? ed.code_postal.slice(0, 2) : ''}
                  </p>
                </td>

                <td style={cellStyle}>
                  <p
                    className="font-mono"
                    style={{
                      fontSize: 13,
                      color: 'var(--color-text)',
                      fontWeight: 500,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {euros(ed?.chiffre_affaires_dernier)}
                  </p>
                  {ed?.taux_marge_dernier != null && (
                    <p
                      className="font-mono"
                      style={{
                        fontSize: 10,
                        color: 'var(--color-muted)',
                        marginTop: 1,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      marge {ed.taux_marge_dernier}%
                    </p>
                  )}
                </td>

                <td style={cellStyle}>
                  <PatrimonyScoreBadge score={prospect.patrimony_score ?? null} />
                  {ed?.patrimoine_total_estime && (
                    <p
                      className="font-mono"
                      style={{
                        fontSize: 10,
                        color: 'var(--color-muted)',
                        marginTop: 3,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      ~{(ed.patrimoine_total_estime / 1_000_000).toFixed(1)}M€
                    </p>
                  )}
                </td>

                <td style={cellStyle}>
                  <div className="flex flex-wrap" style={{ gap: 4 }}>
                    {signals.map((s, i) => (
                      <SignalBadge key={i} type={s.type} size="sm" />
                    ))}
                    {signals.length === 0 && (
                      <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>—</span>
                    )}
                  </div>
                </td>

                <td style={cellStyle}>
                  <span
                    style={{
                      display: 'inline-flex',
                      padding: '2px 8px',
                      fontSize: 11,
                      fontWeight: 500,
                      borderRadius: 2,
                      ...stageStyle(prospect.crm_stage),
                    }}
                  >
                    {stageLabel}
                  </span>
                </td>

                <td style={{ ...cellStyle, textAlign: 'right' }}>
                  <div
                    className="flex items-center justify-end"
                    style={{ gap: 12 }}
                    onClick={e => e.stopPropagation()}
                  >
                    {prospect.linkedin_url ? (
                      <a
                        href={prospect.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Voir profil LinkedIn"
                        style={{ color: 'var(--color-accent)', display: 'inline-flex' }}
                      >
                        <LinkedinIcon />
                      </a>
                    ) : ed?.linkedin_search_url ? (
                      <a
                        href={ed.linkedin_search_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Rechercher sur LinkedIn"
                        style={{ color: 'var(--color-muted)', display: 'inline-flex' }}
                      >
                        <LinkedinIcon />
                      </a>
                    ) : null}
                    {ed?.rpps?.doctolib_search_url && (
                      <a
                        href={ed.rpps.doctolib_search_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Trouver sur Doctolib"
                        style={{ color: 'var(--color-muted)', display: 'inline-flex' }}
                      >
                        <Stethoscope size={14} />
                      </a>
                    )}
                    <ChevronRight size={14} style={{ color: 'var(--color-muted)' }} />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
