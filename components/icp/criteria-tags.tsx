'use client'
import type React from 'react'
import { X, Building2, User, Users } from 'lucide-react'
import type { ParsedIcpCriteria, TargetType } from '@/lib/types'

const TARGET_TYPE_CONFIG: Record<TargetType, { label: string; Icon: React.ElementType }> = {
  personne_morale: { label: 'Personne morale (entreprise)', Icon: Building2 },
  personne_physique: { label: 'Personne physique (individu)', Icon: User },
  both: { label: 'Personnes morales & physiques', Icon: Users },
}

const SIGNAL_LABELS: Record<string, string> = {
  cession_entreprise: 'Cession entreprise',
  levee_fonds: 'Levée de fonds',
  creation_holding: 'Création holding/SCI',
  transaction_immo: 'Transaction immo',
  nouveau_poste: 'Nouveau poste',
  installation_cabinet: 'Installation cabinet',
  post_linkedin: 'Post LinkedIn',
  retraite_imminente: 'Retraite imminente',
  divorce: 'Divorce',
  succession: 'Succession',
  augmentation_capital: 'Augmentation de capital',
}

interface Props {
  criteria: ParsedIcpCriteria
  onChange: (criteria: ParsedIcpCriteria) => void
}

const tagStyle = (variant: 'default' | 'accent'): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 2,
  background: variant === 'accent' ? 'var(--color-accent-dim)' : 'var(--color-bg)',
  color: variant === 'accent' ? 'var(--color-accent)' : 'var(--color-text)',
  border: `1px solid ${variant === 'accent' ? 'var(--color-accent)' : 'var(--color-border)'}`,
})

const removeBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  color: 'inherit',
  opacity: 0.6,
}

const groupLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-muted)',
  marginBottom: 8,
}

function TagGroup({
  label,
  items,
  variant,
  onRemove,
}: {
  label: string
  items: string[]
  variant: 'default' | 'accent'
  onRemove: (item: string) => void
}) {
  if (!items.length) return null
  return (
    <div>
      <p style={groupLabelStyle}>{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map(item => (
          <span key={item} style={tagStyle(variant)}>
            {SIGNAL_LABELS[item] ?? item}
            <button onClick={() => onRemove(item)} style={removeBtnStyle} aria-label="Retirer">
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

export function CriteriaTags({ criteria, onChange }: Props) {
  const remove = (field: keyof ParsedIcpCriteria, value: string) => {
    const current = criteria[field] as string[]
    onChange({ ...criteria, [field]: current.filter(v => v !== value) })
  }

  const targetConfig = criteria.target_type ? TARGET_TYPE_CONFIG[criteria.target_type] : null

  return (
    <div className="space-y-5">
      {targetConfig && (
        <div>
          <p style={groupLabelStyle}>Cible</p>
          <span style={tagStyle('default')}>
            <targetConfig.Icon size={12} />
            {targetConfig.label}
            <button
              onClick={() => onChange({ ...criteria, target_type: undefined })}
              style={removeBtnStyle}
              aria-label="Retirer"
            >
              <X size={11} />
            </button>
          </span>
        </div>
      )}
      <TagGroup label="Rôles" items={criteria.roles} variant="default" onRemove={v => remove('roles', v)} />
      <TagGroup label="Secteurs" items={criteria.sectors} variant="default" onRemove={v => remove('sectors', v)} />
      <TagGroup label="Localisations" items={criteria.locations} variant="default" onRemove={v => remove('locations', v)} />
      <TagGroup label="Mots-clés" items={criteria.keywords} variant="default" onRemove={v => remove('keywords', v)} />
      <TagGroup
        label="Signaux prioritaires"
        items={criteria.signal_priorities}
        variant="accent"
        onRemove={v => remove('signal_priorities', v)}
      />
      {criteria.patrimony_level && (
        <div>
          <p style={groupLabelStyle}>Niveau patrimonial</p>
          <span style={tagStyle('accent')}>
            {{ standard: 'Standard (200K–1M€)', high: 'Élevé (1M–5M€)', very_high: 'Très élevé (5M€+)' }[criteria.patrimony_level]}
            <button
              onClick={() => onChange({ ...criteria, patrimony_level: undefined })}
              style={removeBtnStyle}
              aria-label="Retirer"
            >
              <X size={11} />
            </button>
          </span>
        </div>
      )}
    </div>
  )
}
