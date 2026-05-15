'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Loader2,
  StickyNote,
  Phone,
  Mail,
  MessageCircle,
  Calendar,
  HelpCircle,
  Trash2,
  Send,
} from 'lucide-react'
import { ALLOWED_ACTIVITY_KINDS } from '@/lib/personas/activity-helpers'
import type { ActivityKind, ProspectActivity } from '@/lib/types'

interface Props {
  prospectId: string
}

const KIND_LABEL: Record<ActivityKind, string> = {
  note: 'Note',
  call: 'Appel',
  email_sent: 'Email envoyé',
  linkedin_message: 'Message LinkedIn',
  meeting: 'RDV',
  other: 'Autre',
}

const KIND_ICON: Record<ActivityKind, React.ElementType> = {
  note: StickyNote,
  call: Phone,
  email_sent: Mail,
  linkedin_message: MessageCircle,
  meeting: Calendar,
  other: HelpCircle,
}

// Use the canonical list from activity-helpers so the picker + the server
// validator stay in sync.
const ORDERED_KINDS: readonly ActivityKind[] = ALLOWED_ACTIVITY_KINDS

function formatWhen(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dayDiff = Math.floor((today.getTime() - new Date(d).setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24))
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (dayDiff === 0) return `Aujourd’hui ${time}`
  if (dayDiff === 1) return `Hier ${time}`
  if (dayDiff < 7) return `Il y a ${dayDiff} jours · ${time}`
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) + ` · ${time}`
}

/**
 * Interactions log — per-prospect free-form journal of notes / calls /
 * emails / meetings. Form on top, timeline below. Author can delete their
 * own entries (RLS enforced server-side).
 */
export function ProspectActivityLog({ prospectId }: Props) {
  const [items, setItems] = useState<ProspectActivity[] | null>(null)
  const [kind, setKind] = useState<ActivityKind>('note')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/prospects/${prospectId}/activity`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'load failed')
      setItems(data.activity ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    }
  }, [prospectId])

  // Standard data-fetch-on-mount pattern. The setState inside refetch happens
  // after the async fetch resolves — exactly the case the React docs accept.
  // We disable the rule on the call itself, not on the useEffect line, since
  // the lint runs on the actual setState target.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refetch()
  }, [refetch])

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const trimmed = body.trim()
    if (!trimmed || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/prospects/${prospectId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, body: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'POST failed')
      // Prepend the new activity locally for instant feedback; refetch backs it up.
      if (data.activity) {
        setItems((prev) => [data.activity as ProspectActivity, ...(prev ?? [])])
      }
      setBody('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de l’enregistrement')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(activityId: string) {
    if (!confirm('Supprimer cette interaction ?')) return
    // Optimistic remove
    setItems((prev) => (prev ?? []).filter((a) => a.id !== activityId))
    try {
      const res = await fetch(`/api/prospects/${prospectId}/activity/${activityId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        refetch()
        setError('Suppression échouée — seule la personne qui a créé la note peut la retirer.')
      }
    } catch {
      refetch()
    }
  }

  return (
    <div>
      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 2,
          padding: 14,
          marginBottom: 20,
        }}
      >
        <div className="flex flex-wrap gap-2 mb-2">
          {ORDERED_KINDS.map((k) => {
            const Icon = KIND_ICON[k]
            const active = k === kind
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 500,
                  background: active ? 'var(--color-accent)' : 'var(--color-bg)',
                  color: active ? '#fff' : 'var(--color-text)',
                  border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  borderRadius: 2,
                  cursor: 'pointer',
                }}
              >
                <Icon size={11} />
                {KIND_LABEL[k]}
              </button>
            )
          })}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder={
            kind === 'note'
              ? 'Tape une note sur ce prospect…'
              : kind === 'call'
                ? 'Résumé de l’appel : sujets, décisions, prochaine étape…'
                : kind === 'meeting'
                  ? 'Résumé du RDV : participants, objectifs, suite…'
                  : 'Détails…'
          }
          style={{
            width: '100%',
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: 2,
            padding: '10px 12px',
            fontSize: 13,
            fontFamily: 'inherit',
            resize: 'vertical',
            outline: 'none',
            lineHeight: 1.5,
          }}
        />
        <div className="flex items-center justify-between mt-2">
          <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
            {error ?? 'Ctrl+Entrée pour enregistrer'}
          </span>
          <button
            type="submit"
            disabled={!body.trim() || submitting}
            className="inline-flex items-center gap-2 transition-opacity disabled:opacity-40"
            style={{
              background: 'var(--color-accent)',
              color: '#fff',
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 2,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {submitting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            {submitting ? 'Enregistre…' : 'Enregistrer'}
          </button>
        </div>
      </form>

      {/* Timeline */}
      {items === null ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-muted)', fontSize: 13 }}>
          <Loader2 size={14} className="animate-spin" />
          Chargement…
        </div>
      ) : items.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
          Aucune interaction enregistrée. La première note s&apos;affichera ici.
        </p>
      ) : (
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {items.map((a) => {
            const Icon = KIND_ICON[a.kind] ?? StickyNote
            return (
              <li
                key={a.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '28px 1fr auto',
                  gap: 12,
                  alignItems: 'start',
                  padding: '12px 0',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
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
                  <div className="flex items-baseline gap-3">
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: 'var(--color-accent)',
                      }}
                    >
                      {KIND_LABEL[a.kind]}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                      {formatWhen(a.occurred_at)}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: 13,
                      color: 'var(--color-text)',
                      marginTop: 4,
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.5,
                    }}
                  >
                    {a.body}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(a.id)}
                  aria-label="Supprimer"
                  title="Supprimer (seul l'auteur)"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-muted)',
                    padding: 4,
                    opacity: 0.4,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '1'
                    e.currentTarget.style.color = 'var(--color-error, #c44)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '0.4'
                    e.currentTarget.style.color = 'var(--color-muted)'
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
