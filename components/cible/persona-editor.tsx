'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, Save, Trash2, RefreshCw } from 'lucide-react'
import { CriteriaEditor } from './criteria-editor'
import type { Icp, ParsedIcpCriteria, StrictFilters } from '@/lib/types'

const EXAMPLES = [
  'Médecins généralistes installés depuis moins de 5 ans en Île-de-France',
  'Dirigeants de PME tech 50-200 salariés en croissance dans le Sud, fondateurs depuis 5 ans+, CA > 5M€',
  'Avocats associés dans des cabinets de 10+ personnes en France',
]

interface Props {
  /** When set, edits an existing persona. When null, creates a new one. */
  persona: Icp | null
  /** Notified after save/delete so the parent can refresh the list. */
  onSaved?: (persona: Icp | null) => void
}

const EMPTY_CRITERIA: ParsedIcpCriteria = {
  roles: [],
  sectors: [],
  locations: [],
  keywords: [],
  signal_priorities: [],
}

export function PersonaEditor({ persona, onSaved }: Props) {
  const router = useRouter()
  const [name, setName] = useState(persona?.name ?? '')
  const [description, setDescription] = useState(persona?.raw_description ?? '')
  const [criteria, setCriteria] = useState<ParsedIcpCriteria>(
    persona?.parsed_criteria ?? EMPTY_CRITERIA,
  )
  const [strictFilters, setStrictFilters] = useState<StrictFilters>(persona?.strict_filters ?? {})
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reparsing, setReparsing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Flipped to true right after a successful save, flipped back to false the
  // moment the user touches any field. No timestamp/Date.now in render — the
  // parent re-mounts this component on persona switch (key={persona.id}) so
  // state initialisation is enough; no useEffect needed.
  const [justSaved, setJustSaved] = useState(false)

  const isNew = persona === null

  function dirty<T>(setter: (v: T) => void) {
    return (v: T) => {
      setJustSaved(false)
      setter(v)
    }
  }

  async function handleParseAndCreate() {
    if (!description.trim()) return
    setParsing(true)
    setError(null)
    try {
      const res = await fetch('/api/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || undefined,
          description: description.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onSaved?.(data.persona)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setParsing(false)
    }
  }

  async function handleSave() {
    if (!persona) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/personas/${persona.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || undefined,
          raw_description: description,
          parsed_criteria: criteria,
          strict_filters: strictFilters,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onSaved?.(data.persona)
      setJustSaved(true)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setSaving(false)
    }
  }

  async function handleReparse() {
    if (!persona) return
    setReparsing(true)
    setError(null)
    try {
      // Persist any unsaved description edits first, then re-parse server-side.
      if (description !== persona.raw_description) {
        await fetch(`/api/personas/${persona.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw_description: description }),
        })
      }
      const res = await fetch(`/api/personas/${persona.id}/reparse`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCriteria(data.persona.parsed_criteria)
      onSaved?.(data.persona)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setReparsing(false)
    }
  }

  async function handleDelete() {
    if (!persona) return
    if (!confirm(`Supprimer la cible "${persona.name}" ?`)) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/personas/${persona.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Suppression échouée')
      }
      onSaved?.(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6" style={{ maxWidth: 720 }}>
      <Card>
        <Label>Nom de la cible</Label>
        <input
          value={name}
          onChange={(e) => dirty(setName)(e.target.value)}
          placeholder="ex. Dirigeants PME V1"
          style={{
            width: '100%',
            marginTop: 8,
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: 2,
            padding: '10px 14px',
            fontSize: 14,
            outline: 'none',
          }}
        />

        <div style={{ height: 16 }} />

        <Label>Description en langage naturel</Label>
        <textarea
          value={description}
          onChange={(e) => dirty(setDescription)(e.target.value)}
          rows={4}
          placeholder="Ex : Dirigeants de PME tech (50-200 salariés) en croissance dans le Sud de la France, fondateurs ou CEO depuis plus de 5 ans, avec CA supérieur à 5M€"
          style={{
            width: '100%',
            marginTop: 8,
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: 2,
            padding: '12px 14px',
            fontSize: 14,
            fontFamily: 'inherit',
            resize: 'none',
            outline: 'none',
            lineHeight: 1.5,
          }}
        />

        {isNew && (
          <div className="flex gap-2 flex-wrap mt-3">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setDescription(ex)}
                style={{
                  fontSize: 11,
                  color: 'var(--color-muted)',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {ex.substring(0, 50)}…
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 mt-4">
          <div className="text-xs" style={{ color: 'var(--color-success)' }}>
            {justSaved ? '✓ Sauvegardé' : ''}
          </div>
          <div className="flex gap-2">
            {isNew ? (
              <ActionButton
                onClick={handleParseAndCreate}
                disabled={!description.trim() || parsing}
                primary
                icon={parsing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                label={parsing ? 'Création…' : 'Créer la cible'}
              />
            ) : (
              <>
                <ActionButton
                  onClick={handleReparse}
                  disabled={reparsing || !description.trim()}
                  icon={reparsing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  label={reparsing ? 'Ré-analyse…' : 'Ré-analyser avec IA'}
                />
                <ActionButton
                  onClick={handleSave}
                  disabled={saving}
                  primary
                  icon={saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  label={saving ? 'Enregistrement…' : 'Enregistrer'}
                />
              </>
            )}
          </div>
        </div>

        {error && (
          <p className="text-sm mt-3" style={{ color: 'var(--color-error)' }}>
            {error}
          </p>
        )}
      </Card>

      {!isNew && (
        <Card>
          <SectionHeading>Filtres extraits — ajustables à la main</SectionHeading>
          <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 4, marginBottom: 20 }}>
            Chaque filtre peut être marqué <strong>Strict</strong> — son poids dans le score sera renforcé. Le critère &laquo;&nbsp;100%&nbsp;&raquo; ne signifie pas exclusion, juste que le prospect est priorisé.
          </p>
          <CriteriaEditor
            criteria={criteria}
            strictFilters={strictFilters}
            onChange={({ criteria: c, strict_filters: s }) => {
              setJustSaved(false)
              setCriteria(c)
              setStrictFilters(s)
            }}
          />
        </Card>
      )}

      {!isNew && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center gap-2 transition-opacity disabled:opacity-40"
            style={{
              background: 'transparent',
              color: 'var(--color-error)',
              padding: '8px 12px',
              fontSize: 12,
              border: '1px solid var(--color-error)',
              borderRadius: 2,
              cursor: 'pointer',
            }}
          >
            <Trash2 size={13} />
            {deleting ? 'Suppression…' : 'Supprimer cette cible'}
          </button>
        </div>
      )}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 2,
        padding: 24,
      }}
    >
      {children}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="block"
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--color-muted)',
      }}
    >
      {children}
    </label>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="font-display"
      style={{
        fontSize: 18,
        fontWeight: 600,
        color: 'var(--color-text)',
        letterSpacing: '-0.01em',
      }}
    >
      {children}
    </h3>
  )
}

function ActionButton({
  onClick,
  disabled,
  icon,
  label,
  primary,
}: {
  onClick: () => void
  disabled?: boolean
  icon: React.ReactNode
  label: string
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 transition-opacity disabled:opacity-40"
      style={{
        background: primary ? 'var(--color-accent)' : 'transparent',
        color: primary ? '#fff' : 'var(--color-text)',
        padding: '9px 14px',
        fontSize: 13,
        fontWeight: 600,
        borderRadius: 2,
        border: primary ? 'none' : '1px solid var(--color-border)',
        cursor: 'pointer',
      }}
    >
      {icon}
      {label}
    </button>
  )
}
