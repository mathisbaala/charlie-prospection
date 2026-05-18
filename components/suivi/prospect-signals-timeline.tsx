'use client'
import { useState, useEffect } from 'react'
import { Loader2, Building2, FileText, AlertCircle, ArrowRightLeft, Banknote, UserCheck } from 'lucide-react'

interface SignalRow {
  id: string
  type: string
  source: string
  data: { libelle?: string; entreprise_nom?: string; code_naf?: string; departement?: string } & Record<string, unknown>
  valeur_estimee: number | null
  detected_at: string
  read: boolean
}

interface Props {
  prospectId: string
}

const TYPE_LABEL: Record<string, string> = {
  // Legacy SignalType
  cession_entreprise: 'Cession entreprise',
  levee_fonds: 'Levée de fonds',
  creation_holding: 'Création holding',
  transaction_immo: 'Transaction immo',
  nouveau_poste: 'Nouveau poste',
  installation_cabinet: 'Installation cabinet',
  post_linkedin: 'Post LinkedIn',
  retraite_imminente: 'Retraite imminente',
  divorce: 'Divorce',
  succession: 'Succession',
  augmentation_capital: 'Augmentation capital',
  // InboxEventType (new in PR 1)
  cession: 'Cession',
  creation: 'Création',
  radiation: 'Radiation',
  modification: 'Modification',
  procedure_collective: 'Procédure collective',
  modif_capital: 'Modification de capital',
  modif_beneficiaire: 'Modification BE',
  depot_comptes: 'Dépôt des comptes',
  autre: 'Autre',
}

const TYPE_ICON: Record<string, React.ElementType> = {
  cession_entreprise: ArrowRightLeft,
  cession: ArrowRightLeft,
  augmentation_capital: Banknote,
  modif_capital: Banknote,
  modif_beneficiaire: UserCheck,
  procedure_collective: AlertCircle,
  radiation: AlertCircle,
  creation: Building2,
  creation_holding: Building2,
  installation_cabinet: Building2,
  modification: FileText,
  depot_comptes: FileText,
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function relativeDate(iso: string): string {
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (days < 1) return 'aujourd&rsquo;hui'.replace('&rsquo;', '’')
  if (days === 1) return 'hier'
  if (days < 7) return `il y a ${days} j`
  if (days < 30) return `il y a ${Math.floor(days / 7)} sem`
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`
  return `il y a ${Math.floor(days / 365)} ans`
}

// Group display types — keeps the chip count manageable. Each chip maps to a
// set of underlying raw types (legacy + InboxEventType).
const FILTER_GROUPS: Array<{ id: string; label: string; types: string[] }> = [
  { id: 'all', label: 'Tous', types: [] },
  { id: 'cession', label: 'Cessions', types: ['cession', 'cession_entreprise'] },
  { id: 'creation', label: 'Créations', types: ['creation', 'installation_cabinet'] },
  { id: 'modif_capital', label: 'Modif. capital', types: ['modif_capital', 'augmentation_capital'] },
  { id: 'modif_be', label: 'Modif. BE', types: ['modif_beneficiaire', 'creation_holding'] },
  { id: 'procedure', label: 'Procédures coll.', types: ['procedure_collective'] },
  { id: 'radiation', label: 'Radiations', types: ['radiation'] },
  { id: 'modification', label: 'Modifs', types: ['modification', 'nouveau_poste'] },
  { id: 'dpc', label: 'Dépôts comptes', types: ['depot_comptes'] },
]

/**
 * Vertical signal timeline for the prospect detail panel.
 * Fetches /api/prospects/[id]/signals on mount, then filters client-side.
 */
export function ProspectSignalsTimeline({ prospectId }: Props) {
  const [signals, setSignals] = useState<SignalRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<string>('all')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/prospects/${prospectId}/signals`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data.error) setError(data.error)
        else setSignals(data.signals ?? [])
      })
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [prospectId])

  if (error) {
    return (
      <p style={{ fontSize: 13, color: 'var(--color-error)' }}>
        Erreur de chargement des signaux : {error}
      </p>
    )
  }
  if (signals === null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-muted)', fontSize: 13 }}>
        <Loader2 size={14} className="animate-spin" />
        Chargement des signaux…
      </div>
    )
  }
  if (signals.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
        Aucun signal détecté sur les 12 derniers mois. Les nouveaux signaux apparaîtront ici dès
        leur détection par le firehose quotidien.
      </p>
    )
  }

  // Filter chips: only show groups that have at least one matching signal —
  // dead chips would just confuse the user.
  const counts = new Map<string, number>()
  for (const s of signals) {
    for (const g of FILTER_GROUPS) {
      if (g.id === 'all') continue
      if (g.types.includes(s.type)) counts.set(g.id, (counts.get(g.id) ?? 0) + 1)
    }
  }
  const visibleFilters = FILTER_GROUPS.filter(
    (g) => g.id === 'all' || (counts.get(g.id) ?? 0) > 0,
  )

  const filtered = (() => {
    if (activeFilter === 'all') return signals
    const group = FILTER_GROUPS.find((g) => g.id === activeFilter)
    if (!group) return signals
    return signals.filter((s) => group.types.includes(s.type))
  })()

  return (
    <>
      {/* Filter chip row */}
      <div className="flex flex-wrap gap-2" style={{ marginBottom: 16 }}>
        {visibleFilters.map((g) => {
          const active = g.id === activeFilter
          const count = g.id === 'all' ? signals.length : (counts.get(g.id) ?? 0)
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => setActiveFilter(g.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 500,
                background: active ? 'var(--color-accent)' : 'var(--color-bg)',
                color: active ? '#FDFAF5' : 'var(--color-text)',
                border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                borderRadius: 2,
                cursor: 'pointer',
              }}
            >
              {g.label}
              <span
                style={{
                  fontSize: 10,
                  opacity: 0.7,
                  fontFamily: 'var(--font-mono, monospace)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {filtered.map((s) => {
        const Icon = TYPE_ICON[s.type] ?? FileText
        const typeLabel = TYPE_LABEL[s.type] ?? s.type
        const libelle = s.data?.libelle ?? typeLabel
        return (
          <li
            key={s.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '24px 1fr auto',
              gap: 12,
              alignItems: 'start',
              padding: '14px 0',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 2,
                background: 'var(--color-accent-dim)',
                color: 'var(--color-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon size={13} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: 'var(--color-accent)',
                }}
              >
                {typeLabel}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text)', marginTop: 2 }}>
                {libelle}
              </div>
              {(s.data?.code_naf || s.data?.departement) && (
                <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>
                  {s.data?.code_naf ? `NAF ${s.data.code_naf}` : ''}
                  {s.data?.code_naf && s.data?.departement ? ' · ' : ''}
                  {s.data?.departement ? `Dépt ${s.data.departement}` : ''}
                </div>
              )}
            </div>
            <div
              style={{
                textAlign: 'right',
                fontSize: 11,
                color: 'var(--color-muted)',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--font-mono, monospace)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <div>{formatDate(s.detected_at)}</div>
              <div style={{ opacity: 0.7 }}>{relativeDate(s.detected_at)}</div>
            </div>
          </li>
        )
      })}
      </ol>
    </>
  )
}


