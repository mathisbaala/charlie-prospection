'use client'
import { useState, useEffect } from 'react'
import { Loader2, Building2, FileText, AlertCircle, ArrowRightLeft, Banknote, UserCheck } from 'lucide-react'
import type { SignalSource } from '@/lib/types'

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

/**
 * Vertical signal timeline for the prospect detail panel.
 * Fetches /api/prospects/[id]/signals on mount.
 */
export function ProspectSignalsTimeline({ prospectId }: Props) {
  const [signals, setSignals] = useState<SignalRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {signals.map((s) => {
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
              <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>
                Source: {sourceLabel(s.source as SignalSource)}
                {s.data?.code_naf ? ` · NAF ${s.data.code_naf}` : ''}
                {s.data?.departement ? ` · Dépt ${s.data.departement}` : ''}
              </div>
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
  )
}

function sourceLabel(src: SignalSource | string): string {
  const map: Record<string, string> = {
    bodacc: 'BODACC',
    sirene: 'Sirene INSEE',
    inpi: 'INPI RNE',
    pappers: 'Pappers',
    dvf: 'DVF',
    rpps: 'RPPS',
    jo: 'Journal Officiel',
    linkedin: 'LinkedIn',
    infogreffe: 'Infogreffe',
  }
  return map[src as string] ?? src
}

