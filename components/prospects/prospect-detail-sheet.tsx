'use client'
import {
  ExternalLink,
  Building2,
  MapPin,
  TrendingUp,
  AlertTriangle,
  Home,
  User,
  Stethoscope,
  Users2,
  BarChart3,
} from 'lucide-react'
import { PatrimonyScoreBadge } from './patrimony-score-badge'
import { SignalBadge } from './signal-badge'
import type {
  Prospect,
  ProspectEnrichmentData,
  BodaccEvent,
  DvfTransaction,
} from '@/lib/types'

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

function euros(n: number | null | undefined): string {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M€`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K€`
  return `${n.toLocaleString('fr-FR')}€`
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

export function ProspectDetailSheet({ prospect, onClose, onStageChange }: Props) {
  const ld = prospect.linkedin_data as Record<string, string>
  const ed = prospect.enrichment_data as ProspectEnrichmentData

  const prenom = ed?.dirigeant_prenom ?? ld?.prenom ?? ''
  const nom = ed?.dirigeant_nom ?? ld?.nom_de_famille ?? ''
  const personName = `${titleCase(prenom)} ${titleCase(nom)}`.trim() || 'Prospect'
  const personRole = ed?.dirigeant_qualite ?? ld?.titre ?? '—'
  const companyName = ld?.entreprise ?? ed?.libelle_naf ?? '—'

  const mainTitle = personName
  const mainSubtitle = personRole
  const secondaryLabel = titleCase(companyName)

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
            {mainTitle}
          </h2>
          <p style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 4 }}>
            {mainSubtitle}
          </p>
          <div
            className="flex items-center"
            style={{ gap: 16, marginTop: 10, fontSize: 12, color: 'var(--color-muted)' }}
          >
            <span className="flex items-center" style={{ gap: 4 }}>
              <Building2 size={12} />
              {secondaryLabel}
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

        {/* ── BODY ──────────────────────────────────────────────────── */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 28 }}>
          {/* Cartographie patrimoniale */}
          {(ed?.patrimoine_total_estime ||
            ed?.valeur_entreprise_estimee ||
            ed?.revenus_implicites_estimes) && (
            <Section icon={<TrendingUp size={13} />} label="Cartographie patrimoniale">
              <div className="grid grid-cols-3" style={{ gap: 8 }}>
                {ed?.valeur_entreprise_estimee && (
                  <Stat label="Valeur entreprise" value={euros(ed.valeur_entreprise_estimee)} />
                )}
                {ed?.patrimoine_immo_estime && (
                  <Stat label="Immo estimé" value={euros(ed.patrimoine_immo_estime)} />
                )}
                {ed?.revenus_implicites_estimes && (
                  <Stat label="Revenus est." value={`${euros(ed.revenus_implicites_estimes)}/an`} />
                )}
              </div>
              {ed?.patrimoine_total_estime && (
                <div
                  style={{
                    marginTop: 8,
                    padding: '14px 16px',
                    background: 'var(--color-accent-dim)',
                    borderLeft: '2px solid var(--color-accent)',
                  }}
                >
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--color-accent)',
                    }}
                  >
                    Patrimoine total estimé
                  </p>
                  <p
                    className="font-display"
                    style={{
                      fontSize: 28,
                      fontWeight: 700,
                      color: 'var(--color-text)',
                      letterSpacing: '-0.01em',
                      marginTop: 2,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {euros(ed.patrimoine_total_estime)}
                  </p>
                </div>
              )}
              {ld?.raison_score && (
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--color-muted)',
                    fontStyle: 'italic',
                    marginTop: 8,
                  }}
                >
                  {ld.raison_score}
                </p>
              )}
            </Section>
          )}

          {/* Société d'exercice */}
          <Section icon={<Building2 size={13} />} label="Société d'exercice">
            <DataList>
              {ed?.siren && <Row label="SIREN" value={ed.siren} mono />}
              {ed?.libelle_naf && <Row label="Activité" value={ed.libelle_naf} />}
              {ed?.date_creation_entreprise && (
                <Row
                  label="Créée le"
                  value={new Date(ed.date_creation_entreprise).toLocaleDateString('fr-FR')}
                />
              )}
              {ed?.tranche_effectifs && (
                <Row label="Effectifs" value={`${ed.tranche_effectifs} sal.`} />
              )}
              {ed?.adresse_entreprise && <Row label="Adresse" value={ed.adresse_entreprise} />}
            </DataList>
          </Section>

          {/* Finances Pappers */}
          {ed?.finances && ed.finances.length > 0 && (
            <Section icon={<BarChart3 size={13} />} label="Finances entreprise">
              <div className="grid grid-cols-2" style={{ gap: 8, marginBottom: 12 }}>
                {ed.chiffre_affaires_dernier != null && (
                  <Stat label="Chiffre d'affaires" value={euros(ed.chiffre_affaires_dernier)} />
                )}
                {ed.resultat_dernier != null && (
                  <Stat label="Résultat net" value={euros(ed.resultat_dernier)} />
                )}
                {ed.fonds_propres_dernier != null && (
                  <Stat label="Fonds propres" value={euros(ed.fonds_propres_dernier)} />
                )}
                {ed.taux_marge_dernier != null && (
                  <Stat label="Marge EBITDA" value={`${ed.taux_marge_dernier}%`} />
                )}
              </div>
              {ed.finances.length > 1 && (
                <p
                  className="font-mono"
                  style={{
                    fontSize: 11,
                    color: 'var(--color-muted)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  Évolution CA :{' '}
                  {ed.finances
                    .slice(0, 3)
                    .reverse()
                    .map(f => `${f.annee} ${euros(f.chiffre_affaires)}`)
                    .join(' → ')}
                </p>
              )}
              {ed.capital_social && (
                <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>
                  Capital social : {euros(ed.capital_social)}
                </p>
              )}
              {ed.procedure_collective_en_cours && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '10px 12px',
                    background: 'var(--color-bg)',
                    color: 'var(--color-error)',
                    fontSize: 12,
                    fontWeight: 500,
                    borderLeft: '2px solid var(--color-error)',
                  }}
                >
                  ⚠ Procédure collective en cours
                </div>
              )}
            </Section>
          )}

          {/* Bénéficiaires effectifs */}
          {ed?.beneficiaires_effectifs && ed.beneficiaires_effectifs.length > 0 && (
            <Section
              icon={<Users2 size={13} />}
              label={`Bénéficiaires effectifs (${ed.beneficiaires_effectifs.length})`}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {ed.beneficiaires_effectifs.slice(0, 5).map((b, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between"
                    style={{
                      padding: '8px 12px',
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontWeight: 500, color: 'var(--color-text)' }}>
                      {b.prenom ?? ''} {b.nom ?? ''}
                    </span>
                    <span
                      className="font-mono"
                      style={{
                        color: 'var(--color-muted)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {b.pourcentage_parts != null ? `${b.pourcentage_parts}%` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* RPPS */}
          {ed?.rpps && (
            <Section icon={<Stethoscope size={13} />} label="Profil santé (RPPS)">
              <div
                style={{
                  padding: '14px 16px',
                  background: 'var(--color-bg)',
                  borderLeft: '2px solid var(--color-accent)',
                }}
              >
                <DataList>
                  {ed.rpps.profession && <Row label="Profession" value={ed.rpps.profession} />}
                  {ed.rpps.savoir_faire && (
                    <Row label="Spécialité" value={ed.rpps.savoir_faire} />
                  )}
                  {ed.rpps.mode_exercice && (
                    <Row label="Mode d'exercice" value={ed.rpps.mode_exercice} />
                  )}
                  {ed.rpps.type_activite_liberale && (
                    <Row label="Type activité" value={ed.rpps.type_activite_liberale} />
                  )}
                  {ed.rpps.cabinet_nom && <Row label="Cabinet" value={ed.rpps.cabinet_nom} />}
                  {ed.rpps.cabinet_commune && (
                    <Row
                      label="Commune"
                      value={`${ed.rpps.cabinet_commune}${ed.rpps.cabinet_code_postal ? ` (${ed.rpps.cabinet_code_postal})` : ''}`}
                    />
                  )}
                </DataList>
              </div>
            </Section>
          )}

          {/* BODACC */}
          {ed?.bodacc_events && ed.bodacc_events.length > 0 && (
            <Section
              icon={<AlertTriangle size={13} />}
              label={`Signaux BODACC (${ed.bodacc_events.length})`}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(ed.bodacc_events as BodaccEvent[])
                  .slice(0, 5)
                  .map((event: BodaccEvent, i: number) => (
                    <div key={i} className="flex items-start" style={{ gap: 10 }}>
                      <SignalBadge type={event.type} size="sm" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, color: 'var(--color-text)' }}>
                          {event.libelle}
                        </p>
                        <p
                          className="font-mono"
                          style={{
                            fontSize: 10,
                            color: 'var(--color-muted)',
                            marginTop: 2,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {new Date(event.date).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </Section>
          )}

          {/* DVF */}
          {ed?.dvf_transactions && ed.dvf_transactions.length > 0 && (
            <Section icon={<Home size={13} />} label="Transactions immobilières (zone)">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(ed.dvf_transactions as DvfTransaction[])
                  .slice(0, 3)
                  .map((t: DvfTransaction, i: number) => (
                    <div
                      key={i}
                      style={{
                        padding: '10px 12px',
                        background: 'var(--color-bg)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: 12, color: 'var(--color-text)', fontWeight: 500 }}>
                          {t.type_local}{' '}
                          {t.surface_reelle_bati ? `${t.surface_reelle_bati}m²` : ''}
                        </span>
                        <span
                          className="font-mono"
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: 'var(--color-accent)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {euros(t.valeur_fonciere)}
                        </span>
                      </div>
                      <p
                        style={{
                          fontSize: 11,
                          color: 'var(--color-muted)',
                          marginTop: 2,
                        }}
                      >
                        {t.commune} · {new Date(t.date_mutation).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  ))}
              </div>
            </Section>
          )}

          {/* Liens externes */}
          {(prospect.linkedin_url ||
            ed?.linkedin_search_url ||
            ed?.rpps?.doctolib_search_url) && (
            <Section icon={<ExternalLink size={13} />} label="Liens">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {prospect.linkedin_url ? (
                  <ExternalLinkRow
                    href={prospect.linkedin_url}
                    label={`Voir profil LinkedIn de ${mainTitle}`}
                    variant="primary"
                  />
                ) : ed?.linkedin_search_url ? (
                  <ExternalLinkRow
                    href={ed.linkedin_search_url}
                    label={`Rechercher ${mainTitle} sur LinkedIn`}
                    variant="muted"
                  />
                ) : null}
                {ed?.rpps?.doctolib_search_url && (
                  <ExternalLinkRow
                    href={ed.rpps.doctolib_search_url}
                    label={`Trouver ${mainTitle} sur Doctolib`}
                    variant="muted"
                  />
                )}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Layout primitives ───────────────────────────────────────────────

function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h3
        className="flex items-center"
        style={{
          gap: 6,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-muted)',
          marginBottom: 12,
        }}
      >
        <span style={{ color: 'var(--color-accent)', display: 'inline-flex' }}>{icon}</span>
        {label}
      </h3>
      {children}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-muted)',
        }}
      >
        {label}
      </p>
      <p
        className="font-mono"
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--color-text)',
          marginTop: 4,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </p>
    </div>
  )
}

function DataList({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between" style={{ gap: 16 }}>
      <span style={{ fontSize: 12, color: 'var(--color-muted)', flexShrink: 0 }}>{label}</span>
      <span
        className={mono ? 'font-mono' : ''}
        style={{
          fontSize: 13,
          color: 'var(--color-text)',
          textAlign: 'right',
          fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function ExternalLinkRow({
  href,
  label,
  variant,
}: {
  href: string
  label: string
  variant: 'primary' | 'muted'
}) {
  const accent = variant === 'primary' ? 'var(--color-accent)' : 'var(--color-muted)'
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center transition-colors"
      style={{
        gap: 8,
        padding: '10px 12px',
        background: variant === 'primary' ? 'var(--color-accent-dim)' : 'var(--color-bg)',
        border: `1px solid ${variant === 'primary' ? 'var(--color-accent)' : 'var(--color-border)'}`,
        borderRadius: 2,
        fontSize: 13,
        color: variant === 'primary' ? 'var(--color-accent)' : 'var(--color-text)',
        fontWeight: variant === 'primary' ? 600 : 400,
      }}
    >
      <ExternalLink size={14} style={{ color: accent }} />
      <span style={{ flex: 1 }}>{label}</span>
    </a>
  )
}
