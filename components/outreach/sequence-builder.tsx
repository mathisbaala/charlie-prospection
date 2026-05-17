'use client'
import { Plus, Trash2, Clock, Send, UserPlus } from 'lucide-react'
import type { CampaignStep, StepType } from '@/lib/types'

interface Props {
  steps: Omit<CampaignStep, 'id' | 'campaign_id' | 'org_id' | 'created_at'>[]
  onChange: (steps: Props['steps']) => void
}

const STEP_LABELS: Record<StepType, { label: string; icon: React.ElementType; color: string }> = {
  invitation: { label: 'Invitation LinkedIn', icon: UserPlus, color: 'var(--color-accent)' },
  message:    { label: 'Message LinkedIn',    icon: Send,     color: '#2A6B4A' },
}

const VARIABLES = [
  { label: 'Prénom',    token: '{{firstName}}' },
  { label: 'Nom',       token: '{{lastName}}' },
  { label: 'Entreprise',token: '{{company}}' },
  { label: 'Ville',     token: '{{city}}' },
  { label: 'Secteur',   token: '{{sector}}' },
  { label: 'Signal récent', token: '{{recentSignal}}' },
]

export function SequenceBuilder({ steps, onChange }: Props) {
  const [selected, setSelected] = React.useState<number>(0)

  function addStep() {
    const lastStep = steps[steps.length - 1]
    const newStep: Props['steps'][0] = {
      position: steps.length + 1,
      type: 'message',
      delay_days: lastStep ? 7 : 3,
      template: '',
    }
    onChange([...steps, newStep])
    setSelected(steps.length)
  }

  function removeStep(idx: number) {
    const next = steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, position: i + 1 }))
    onChange(next)
    setSelected(Math.min(selected, next.length - 1))
  }

  function updateStep(idx: number, patch: Partial<Props['steps'][0]>) {
    onChange(steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  function insertVariable(token: string) {
    const textarea = document.getElementById('step-template') as HTMLTextAreaElement
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const current = steps[selected]?.template ?? ''
    const next = current.slice(0, start) + token + current.slice(end)
    updateStep(selected, { template: next })
    setTimeout(() => {
      textarea.setSelectionRange(start + token.length, start + token.length)
      textarea.focus()
    }, 0)
  }

  const activeStep = steps[selected]

  return (
    <div style={{ display: 'flex', gap: 24, height: '100%', minHeight: 420 }}>
      {/* Colonne gauche — flow visuel */}
      <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {steps.map((step, idx) => {
          const meta = STEP_LABELS[step.type]
          const Icon = meta.icon
          const isFirst = idx === 0
          const isSel = idx === selected

          return (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {/* Connecteur vertical */}
              {!isFirst && (
                <div style={{ width: 1, height: 12, background: 'var(--color-border)' }} />
              )}

              {/* Nœud étape */}
              <div
                onClick={() => setSelected(idx)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: isSel ? 'var(--color-accent-dim)' : 'var(--color-surface)',
                  border: `1px solid ${isSel ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                {/* Timing */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--color-muted)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  <Clock size={10} />
                  {step.delay_days === 0 ? 'Immédiatement' : `Délai de ${step.delay_days} jour${step.delay_days > 1 ? 's' : ''}`}
                </div>

                {/* Type */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon size={14} style={{ color: meta.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>
                    {meta.label}
                  </span>
                </div>

                {/* Preview template */}
                {step.template && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 11,
                      color: 'var(--color-muted)',
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      lineHeight: 1.4,
                    }}
                  >
                    {step.template.replace(/\{\{[^}]+\}\}/g, '…')}
                  </div>
                )}

                {/* Delete */}
                {steps.length > 1 && (
                  <button
                    onClick={e => { e.stopPropagation(); removeStep(idx) }}
                    style={{
                      position: 'absolute',
                      top: 8, right: 8,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--color-muted)',
                      padding: 2,
                      opacity: 0.5,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {/* Bouton ajouter étape */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: 1, height: 12, background: 'var(--color-border)' }} />
          <button
            onClick={addStep}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              fontSize: 12,
              color: 'var(--color-accent)',
              background: 'transparent',
              border: '1px dashed var(--color-accent)',
              cursor: 'pointer',
              width: '100%',
              justifyContent: 'center',
            }}
          >
            <Plus size={13} />
            Ajouter une étape
          </button>
        </div>
      </div>

      {/* Colonne droite — éditeur de l'étape sélectionnée */}
      {activeStep && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Type selector */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
              Type
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['invitation', 'message'] as StepType[]).map(t => (
                <button
                  key={t}
                  onClick={() => updateStep(selected, { type: t })}
                  style={{
                    padding: '7px 16px',
                    fontSize: 12,
                    fontWeight: activeStep.type === t ? 600 : 400,
                    background: activeStep.type === t ? 'var(--color-accent-dim)' : 'var(--color-surface)',
                    border: `1px solid ${activeStep.type === t ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    color: activeStep.type === t ? 'var(--color-accent)' : 'var(--color-muted)',
                    cursor: 'pointer',
                  }}
                >
                  {STEP_LABELS[t].label}
                </button>
              ))}
            </div>
          </div>

          {/* Délai (masqué pour le step 1) */}
          {selected > 0 && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                Délai depuis l'étape précédente
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="number"
                  min={0}
                  max={90}
                  value={activeStep.delay_days}
                  onChange={e => updateStep(selected, { delay_days: Number(e.target.value) })}
                  style={{
                    width: 70,
                    padding: '6px 10px',
                    fontSize: 13,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text)',
                  }}
                />
                <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>jours</span>
              </div>
            </div>
          )}

          {/* Message template */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
              Message
            </label>
            <textarea
              id="step-template"
              value={activeStep.template}
              onChange={e => updateStep(selected, { template: e.target.value })}
              placeholder={
                activeStep.type === 'invitation'
                  ? "Message d'invitation (optionnel — max 300 caractères)…"
                  : 'Votre message LinkedIn…'
              }
              maxLength={activeStep.type === 'invitation' ? 300 : 8000}
              style={{
                flex: 1,
                minHeight: 140,
                padding: '10px 12px',
                fontSize: 13,
                lineHeight: 1.6,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
              {/* Variables */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {VARIABLES.map(v => (
                  <button
                    key={v.token}
                    onClick={() => insertVariable(v.token)}
                    style={{
                      padding: '3px 8px',
                      fontSize: 11,
                      background: 'var(--color-accent-dim)',
                      color: 'var(--color-accent)',
                      border: '1px solid rgba(188,107,42,0.2)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-mono, monospace)',
                    }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                {activeStep.template.length}{activeStep.type === 'invitation' ? '/300' : ''}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import React from 'react'
