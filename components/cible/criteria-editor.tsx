'use client'
import type React from 'react'
import { Building2, User, Users } from 'lucide-react'
import { ArrayTagEditor } from './array-tag-editor'
import { NumericRangeField } from './numeric-range-field'
import { StrictToggle } from './strict-toggle'
import type {
  ParsedIcpCriteria,
  StrictFilters,
  TargetType,
  SignalType,
} from '@/lib/types'

const TARGET_TYPE_CONFIG: Record<TargetType, { label: string; Icon: React.ElementType }> = {
  personne_morale: { label: 'Personne morale', Icon: Building2 },
  personne_physique: { label: 'Personne physique', Icon: User },
  both: { label: 'Les deux', Icon: Users },
}

const PATRIMONY_OPTIONS: Array<{ value: 'standard' | 'high' | 'very_high'; label: string }> = [
  { value: 'standard', label: 'Standard (200K–1M€)' },
  { value: 'high', label: 'Élevé (1M–5M€)' },
  { value: 'very_high', label: 'Très élevé (5M€+)' },
]

const SIGNAL_LABELS: Record<SignalType, string> = {
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
  augmentation_capital: 'Augmentation capital',
}

interface Props {
  criteria: ParsedIcpCriteria
  strictFilters: StrictFilters
  onChange: (next: { criteria: ParsedIcpCriteria; strict_filters: StrictFilters }) => void
}

/**
 * Full editable filter UI for a persona. Every array is add+remove (via
 * ArrayTagEditor), every numeric range has min/max inputs, and every field
 * has a "Strict" toggle that flips its key in strict_filters.
 */
export function CriteriaEditor({ criteria, strictFilters, onChange }: Props) {
  function update(patch: Partial<ParsedIcpCriteria>) {
    onChange({ criteria: { ...criteria, ...patch }, strict_filters: strictFilters })
  }
  function setStrict(field: keyof ParsedIcpCriteria, value: boolean) {
    const next = { ...strictFilters }
    if (value) next[field] = true
    else delete next[field]
    onChange({ criteria, strict_filters: next })
  }
  const isStrict = (field: keyof ParsedIcpCriteria) => !!strictFilters[field]

  return (
    <div className="space-y-6">
      {/* Target type — radio + clear */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p style={groupLabelStyle}>Type de cible</p>
          <StrictToggle
            active={isStrict('target_type')}
            onToggle={() => setStrict('target_type', !isStrict('target_type'))}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(TARGET_TYPE_CONFIG) as TargetType[]).map((tt) => {
            const cfg = TARGET_TYPE_CONFIG[tt]
            const Icon = cfg.Icon
            const active = criteria.target_type === tt
            return (
              <button
                key={tt}
                type="button"
                onClick={() => update({ target_type: active ? undefined : tt })}
                style={{
                  ...chipStyle(active),
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Icon size={12} />
                {cfg.label}
              </button>
            )
          })}
        </div>
      </div>

      <ArrayTagEditor
        label="Rôles"
        items={criteria.roles ?? []}
        onChange={(v) => update({ roles: v })}
        strict={isStrict('roles')}
        onStrictChange={(v) => setStrict('roles', v)}
        placeholder="ex. Médecin généraliste"
      />

      <ArrayTagEditor
        label="Secteurs"
        items={criteria.sectors ?? []}
        onChange={(v) => update({ sectors: v })}
        strict={isStrict('sectors')}
        onStrictChange={(v) => setStrict('sectors', v)}
        placeholder="ex. Santé"
      />

      <ArrayTagEditor
        label="Localisations"
        items={criteria.locations ?? []}
        onChange={(v) => update({ locations: v })}
        strict={isStrict('locations')}
        onStrictChange={(v) => setStrict('locations', v)}
        placeholder="ex. Paris, Île-de-France"
      />

      <ArrayTagEditor
        label="Mots-clés"
        items={criteria.keywords ?? []}
        onChange={(v) => update({ keywords: v })}
        strict={isStrict('keywords')}
        onStrictChange={(v) => setStrict('keywords', v)}
        placeholder="ex. levée de fonds"
      />

      <ArrayTagEditor
        label="Signaux prioritaires"
        items={criteria.signal_priorities ?? []}
        onChange={(v) => update({ signal_priorities: v as SignalType[] })}
        variant="accent"
        strict={isStrict('signal_priorities')}
        onStrictChange={(v) => setStrict('signal_priorities', v)}
        placeholder="ex. cession_entreprise"
        displayLabel={(v) => SIGNAL_LABELS[v as SignalType] ?? v}
      />

      <NumericRangeField
        label="Chiffre d'affaires"
        unit="€"
        min={criteria.ca_min}
        max={criteria.ca_max}
        onChange={({ min, max }) => update({ ca_min: min, ca_max: max })}
        strict={isStrict('ca_min') || isStrict('ca_max')}
        onStrictChange={(v) => {
          // Toggle both bounds together — they share semantics.
          setStrict('ca_min', v)
          setStrict('ca_max', v)
        }}
      />

      <NumericRangeField
        label="Effectif salarié"
        min={criteria.effectif_min}
        max={criteria.effectif_max}
        onChange={({ min, max }) => update({ effectif_min: min, effectif_max: max })}
        strict={isStrict('effectif_min') || isStrict('effectif_max')}
        onStrictChange={(v) => {
          setStrict('effectif_min', v)
          setStrict('effectif_max', v)
        }}
      />

      <NumericRangeField
        label="Âge dirigeant"
        unit="ans"
        min={criteria.age_min}
        max={criteria.age_max}
        onChange={({ min, max }) => update({ age_min: min, age_max: max })}
        strict={isStrict('age_min') || isStrict('age_max')}
        onStrictChange={(v) => {
          setStrict('age_min', v)
          setStrict('age_max', v)
        }}
      />

      {/* Patrimony level — chip group */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p style={groupLabelStyle}>Niveau patrimonial</p>
          <StrictToggle
            active={isStrict('patrimony_level')}
            onToggle={() => setStrict('patrimony_level', !isStrict('patrimony_level'))}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {PATRIMONY_OPTIONS.map(({ value, label }) => {
            const active = criteria.patrimony_level === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => update({ patrimony_level: active ? undefined : value })}
                style={chipStyle(active)}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Geo strict — checkbox-style toggle */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p style={groupLabelStyle}>Géofiltrage</p>
        </div>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            fontSize: 13,
            color: 'var(--color-text)',
          }}
        >
          <input
            type="checkbox"
            checked={!!criteria.geo_strict}
            onChange={(e) => update({ geo_strict: e.target.checked })}
            style={{ accentColor: 'var(--color-accent)' }}
          />
          N&apos;élargit pas aux départements adjacents (mode strict)
        </label>
      </div>
    </div>
  )
}

const groupLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-muted)',
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 12px',
    fontSize: 12,
    fontWeight: 500,
    borderRadius: 2,
    background: active ? 'var(--color-accent)' : 'var(--color-bg)',
    color: active ? '#fff' : 'var(--color-text)',
    border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
    cursor: 'pointer',
  }
}
