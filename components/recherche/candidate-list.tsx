'use client'
import { Check, MapPin, Building2, User } from 'lucide-react'
import type { SearchCandidate } from '@/lib/types'

interface Props {
  candidates: SearchCandidate[]
  selected: Set<string>
  onToggle: (uid: string) => void
}

const NIVEAU_LABEL: Record<SearchCandidate['niveau'], string> = {
  faible: 'Faible',
  moyen: 'Moyen',
  fort: 'Fort',
  prioritaire: 'Prioritaire',
}

const NIVEAU_COLOR: Record<SearchCandidate['niveau'], string> = {
  faible: 'var(--color-muted)',
  moyen: 'var(--color-muted)',
  fort: 'var(--color-accent)',
  prioritaire: 'var(--color-accent)',
}

function formatCurrency(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M€`
  if (n >= 1_000) return `${Math.round(n / 1_000)} K€`
  return `${Math.round(n)} €`
}

/**
 * Result table for /recherche. Each row has a checkbox; bulk action lives in
 * BulkAddBar. Already-in-suivi candidates are visually muted and not
 * selectable.
 */
export function CandidateList({ candidates, selected, onToggle }: Props) {
  if (candidates.length === 0) return null

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
          {candidates.length} prospect{candidates.length > 1 ? 's' : ''} trouvé
          {candidates.length > 1 ? 's' : ''}
        </span>
        <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
          Trié par score patrimoine ↓
        </span>
      </header>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {candidates.map((c) => {
          const isSelected = selected.has(c.uid)
          const fullName =
            `${c.raw.dirigeant_prenom} ${c.raw.dirigeant_nom}`.trim() || c.raw.entreprise_nom
          const ca = formatCurrency(c.enrichment_data?.chiffre_affaires_dernier)
          const patrimoine = formatCurrency(c.enrichment_data?.patrimoine_total_estime)
          const PersonaIcon = c.raw.source_type === 'personne_morale' ? Building2 : User

          return (
            <li
              key={c.uid}
              onClick={() => !c.already_in_suivi && onToggle(c.uid)}
              style={{
                display: 'grid',
                gridTemplateColumns: '36px 80px 1fr auto auto',
                gap: 16,
                alignItems: 'center',
                padding: '14px 16px',
                borderBottom: '1px solid var(--color-border)',
                cursor: c.already_in_suivi ? 'not-allowed' : 'pointer',
                opacity: c.already_in_suivi ? 0.5 : 1,
                background: isSelected ? 'var(--color-accent-dim)' : 'transparent',
              }}
            >
              {/* Checkbox */}
              <div
                style={{
                  width: 18,
                  height: 18,
                  border: `1px solid ${isSelected ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  borderRadius: 2,
                  background: isSelected ? 'var(--color-accent)' : 'var(--color-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {isSelected && <Check size={12} color="#fff" strokeWidth={3} />}
              </div>

              {/* Score (hero) */}
              <div
                style={{
                  textAlign: 'right',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    color: NIVEAU_COLOR[c.niveau],
                    lineHeight: 1,
                  }}
                >
                  {c.patrimony_score}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--color-muted)',
                    marginTop: 2,
                  }}
                >
                  {NIVEAU_LABEL[c.niveau]}
                </div>
              </div>

              {/* Identity */}
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'var(--color-text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {fullName}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--color-muted)',
                    marginTop: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <PersonaIcon size={11} />
                    {c.raw.entreprise_nom}
                  </span>
                  {c.raw.ville && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={11} />
                      {c.raw.ville}
                    </span>
                  )}
                  {c.raw.libelle_naf && (
                    <span style={{ opacity: 0.7 }}>· {c.raw.libelle_naf}</span>
                  )}
                </div>
                {c.raison_principale && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--color-muted)',
                      marginTop: 4,
                      fontStyle: 'italic',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 480,
                    }}
                  >
                    {c.raison_principale}
                  </div>
                )}
              </div>

              {/* Financials column */}
              <div
                style={{
                  textAlign: 'right',
                  fontSize: 12,
                  color: 'var(--color-muted)',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                }}
              >
                {ca && <div>CA {ca}</div>}
                {patrimoine && <div style={{ opacity: 0.7 }}>{patrimoine}</div>}
              </div>

              {/* Already-in-suivi tag */}
              <div style={{ minWidth: 90, textAlign: 'right' }}>
                {c.already_in_suivi && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      color: 'var(--color-muted)',
                    }}
                  >
                    Déjà en suivi
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
