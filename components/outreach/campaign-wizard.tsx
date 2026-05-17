'use client'
import { useState, useEffect } from 'react'
import { X, ChevronRight, ChevronLeft, Rocket } from 'lucide-react'
import { SequenceBuilder } from './sequence-builder'
import { ProspectSelector } from './prospect-selector'
import type { CampaignStep } from '@/lib/types'
import { DEFAULT_STEPS } from '@/lib/outreach/campaign-helpers'

interface Props {
  onClose: () => void
  onCreated: () => void
}

type Step = 'sequence' | 'prospects' | 'launch'

const STEPS: { key: Step; label: string; n: number }[] = [
  { key: 'sequence',  label: 'Séquence',          n: 1 },
  { key: 'prospects', label: 'Liste de prospects', n: 2 },
  { key: 'launch',    label: 'Lancement',          n: 3 },
]

type StepDef = Omit<CampaignStep, 'id' | 'campaign_id' | 'org_id' | 'created_at'>

function defaultName() {
  return `Campagne du ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
}

export function CampaignWizard({ onClose, onCreated }: Props) {
  const [current, setCurrent] = useState<Step>('sequence')
  const [name, setName] = useState(defaultName)
  const [emoji, setEmoji] = useState('🎯')
  const [steps, setSteps] = useState<StepDef[]>(DEFAULT_STEPS)
  const [selectedProspects, setSelectedProspects] = useState<string[]>([])
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cibles, setCibles] = useState<{ id: string; name: string; emoji?: string }[]>([])

  useEffect(() => {
    fetch('/api/personas')
      .then(r => r.ok ? r.json() : { personas: [] })
      .then(d => setCibles(d.personas ?? []))
      .catch(() => {})
  }, [])

  function onCibleChange(cibleName: string) {
    if (!cibleName) { setName(defaultName()); return }
    setName(`${cibleName} · Campagne`)
  }

  const currentIdx = STEPS.findIndex(s => s.key === current)

  function canAdvance() {
    if (current === 'sequence') return name.trim().length > 0 && steps.length > 0
    if (current === 'prospects') return selectedProspects.length > 0
    return true
  }

  function next() {
    const nextStep = STEPS[currentIdx + 1]
    if (nextStep) setCurrent(nextStep.key)
  }

  function back() {
    const prevStep = STEPS[currentIdx - 1]
    if (prevStep) setCurrent(prevStep.key)
  }

  async function launch(startNow: boolean) {
    setLaunching(true)
    setError(null)
    try {
      // Créer la campagne
      const res = await fetch('/api/outreach/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), emoji, steps }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const { campaign } = await res.json()

      // Enrôler les prospects
      const enrollRes = await fetch(`/api/outreach/campaigns/${campaign.id}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_ids: selectedProspects }),
      })
      if (!enrollRes.ok) throw new Error((await enrollRes.json()).error)

      // Activer si demandé
      if (startNow) {
        await fetch(`/api/outreach/campaigns/${campaign.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'active' }),
        })
      }

      onCreated()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLaunching(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(26,22,18,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          width: 860,
          maxWidth: '95vw',
          maxHeight: '90vh',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '16px 24px',
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            gap: 16,
          }}
        >
          {/* Cible + Nom de la campagne */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <input
              value={emoji}
              onChange={e => setEmoji(e.target.value)}
              style={{
                width: 36,
                fontSize: 18,
                textAlign: 'center',
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)',
                padding: '4px',
              }}
            />
            {cibles.length > 0 && (
              <select
                onChange={e => onCibleChange(e.target.value)}
                style={{
                  fontSize: 12,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  color: 'var(--color-muted)',
                  padding: '5px 8px',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <option value="">Choisir une cible…</option>
                {cibles.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            )}
            <input
              autoFocus
              placeholder="Nom de la campagne…"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{
                flex: 1,
                fontSize: 16,
                fontWeight: 600,
                fontFamily: 'var(--font-display)',
                border: 'none',
                background: 'transparent',
                color: 'var(--color-text)',
                outline: 'none',
              }}
            />
          </div>

          {/* Steps tabs */}
          <div style={{ display: 'flex', gap: 2 }}>
            {STEPS.map((s, i) => (
              <button
                key={s.key}
                onClick={() => i <= currentIdx && setCurrent(s.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: current === s.key ? 600 : 400,
                  background: current === s.key ? 'var(--color-accent-dim)' : 'transparent',
                  border: `1px solid ${current === s.key ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  color: current === s.key ? 'var(--color-accent)' : i < currentIdx ? 'var(--color-text)' : 'var(--color-muted)',
                  cursor: i <= currentIdx ? 'pointer' : 'default',
                }}
              >
                <span style={{
                  width: 18, height: 18,
                  borderRadius: '50%',
                  background: current === s.key ? 'var(--color-accent)' : i < currentIdx ? 'var(--color-success)' : 'var(--color-border)',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {s.n}
                </span>
                {s.label}
              </button>
            ))}
          </div>

          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {current === 'sequence' && (
            <SequenceBuilder steps={steps} onChange={setSteps} />
          )}

          {current === 'prospects' && (
            <ProspectSelector selected={selectedProspects} onChange={setSelectedProspects} />
          )}

          {current === 'launch' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 520 }}>
              <h2 className="font-display" style={{ fontSize: 22, fontWeight: 600, color: 'var(--color-text)' }}>
                Prêt à lancer
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <SummaryRow label="Campagne" value={`${emoji} ${name}`} />
                <SummaryRow label="Étapes" value={`${steps.length} étape${steps.length > 1 ? 's' : ''}`} />
                <SummaryRow label="Prospects" value={`${selectedProspects.length} prospect${selectedProspects.length > 1 ? 's' : ''}`} />
              </div>

              <div
                style={{
                  padding: '14px 16px',
                  background: 'rgba(188,107,42,0.07)',
                  border: '1px solid rgba(188,107,42,0.2)',
                  fontSize: 12,
                  color: 'var(--color-text)',
                  lineHeight: 1.6,
                }}
              >
                <strong>Comment ça marche :</strong> L&apos;extension Chrome exécutera les actions sur LinkedIn depuis votre navigateur.
                Assurez-vous que l&apos;extension est connectée et que vous êtes connecté à LinkedIn.
                Le bot respecte les limites LinkedIn (30 invitations/jour, 50 DMs/jour) et tourne entre 8h et 22h.
              </div>

              {error && (
                <div style={{ fontSize: 12, color: 'var(--color-error)', padding: '8px 12px', border: '1px solid var(--color-error)', background: 'rgba(139,34,51,0.05)' }}>
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 24px',
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
          }}
        >
          <button
            onClick={currentIdx === 0 ? onClose : back}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', fontSize: 13,
              background: 'none', border: '1px solid var(--color-border)',
              color: 'var(--color-muted)', cursor: 'pointer',
            }}
          >
            {currentIdx > 0 && <ChevronLeft size={14} />}
            {currentIdx === 0 ? 'Annuler' : 'Retour'}
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            {current === 'launch' ? (
              <>
                <button
                  onClick={() => launch(false)}
                  disabled={launching}
                  style={{
                    padding: '8px 18px', fontSize: 13,
                    background: 'none', border: '1px solid var(--color-border)',
                    color: 'var(--color-text)', cursor: 'pointer',
                  }}
                >
                  Sauvegarder sans lancer
                </button>
                <button
                  onClick={() => launch(true)}
                  disabled={launching}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 20px', fontSize: 13, fontWeight: 600,
                    background: 'var(--color-accent)', border: 'none',
                    color: '#fff', cursor: 'pointer',
                  }}
                >
                  <Rocket size={14} />
                  {launching ? 'Lancement…' : 'Lancer maintenant'}
                </button>
              </>
            ) : (
              <button
                onClick={next}
                disabled={!canAdvance()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 20px', fontSize: 13, fontWeight: 600,
                  background: canAdvance() ? 'var(--color-accent)' : 'var(--color-border)',
                  border: 'none',
                  color: canAdvance() ? '#fff' : 'var(--color-muted)',
                  cursor: canAdvance() ? 'pointer' : 'not-allowed',
                }}
              >
                Suivant
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
      <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>{value}</span>
    </div>
  )
}
