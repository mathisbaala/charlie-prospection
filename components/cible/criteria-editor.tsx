'use client'
import type React from 'react'
import { Building2, User, Users } from 'lucide-react'
import { ArrayTagEditor } from './array-tag-editor'
import { NumericRangeField } from './numeric-range-field'
import type { ParsedIcpCriteria, TargetType, SignalType } from '@/lib/types'

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

const ROLE_SUGGESTIONS = [
  'CEO', 'PDG', 'DG', 'Fondateur', 'Co-fondateur', 'Associé', 'Gérant',
  'Président', 'Directeur général', 'DAF', 'Directeur associé',
  'Médecin', 'Chirurgien', 'Chirurgien-dentiste', 'Spécialiste',
  'Kinésithérapeute', 'Dentiste', 'Vétérinaire', 'Pharmacien',
  'Avocat', 'Notaire', 'Expert-comptable', 'Commissaire aux comptes', 'Architecte',
]

const SECTOR_SUGGESTIONS = [
  'Santé', 'Médical', 'Pharmacie', 'Immobilier', 'BTP', 'Construction',
  'Industrie', 'Technologie', 'SaaS', 'Finance', 'Banque', 'Assurance',
  'Commerce', 'Distribution', 'Conseil', 'Juridique',
  'Agriculture', 'Énergie', 'Transport', 'Logistique', 'Éducation',
]

const LOCATION_SUGGESTIONS = [
  'Paris', 'Lyon', 'Marseille', 'Bordeaux', 'Toulouse', 'Nantes',
  'Strasbourg', 'Lille', 'Montpellier', 'Nice', 'Rennes', 'Grenoble',
  'Île-de-France', 'PACA', 'Auvergne-Rhône-Alpes', 'Occitanie',
  'Grand Est', 'Bretagne', 'Normandie', 'Hauts-de-France', 'Nouvelle-Aquitaine',
  'France entière',
]

const KEYWORD_SUGGESTIONS = [
  'Croissance', 'Levée de fonds', 'Cession', 'Acquisition', 'Fusion-acquisition',
  'Export', 'International', 'Transformation digitale', 'Transmission',
  'Holding', 'SCI', 'Patrimoine', 'Dividendes', 'Capital',
  'Actionnaire majoritaire', 'Succession', 'Restructuration', 'Scale-up',
]

const SIGNAL_SUGGESTIONS = Object.keys(SIGNAL_LABELS) as SignalType[]

interface Props {
  criteria: ParsedIcpCriteria
  onChange: (criteria: ParsedIcpCriteria) => void
}

export function CriteriaEditor({ criteria, onChange }: Props) {
  function update(patch: Partial<ParsedIcpCriteria>) {
    onChange({ ...criteria, ...patch })
  }

  return (
    <div className="space-y-6">
      {/* Type de cible */}
      <div>
        <p style={groupLabelStyle}>Type de cible</p>
        <div className="flex gap-2 flex-wrap mt-2">
          {(Object.keys(TARGET_TYPE_CONFIG) as TargetType[]).map((tt) => {
            const cfg = TARGET_TYPE_CONFIG[tt]
            const Icon = cfg.Icon
            const active = criteria.target_type === tt
            return (
              <button
                key={tt}
                type="button"
                onClick={() => update({ target_type: active ? undefined : tt })}
                style={{ ...chipStyle(active), display: 'inline-flex', alignItems: 'center', gap: 6 }}
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
        placeholder="ex. Médecin généraliste"
        suggestions={ROLE_SUGGESTIONS}
      />

      <ArrayTagEditor
        label="Secteurs"
        items={criteria.sectors ?? []}
        onChange={(v) => update({ sectors: v })}
        placeholder="ex. Santé"
        suggestions={SECTOR_SUGGESTIONS}
      />

      <ArrayTagEditor
        label="Localisations"
        items={criteria.locations ?? []}
        onChange={(v) => update({ locations: v })}
        placeholder="ex. Paris, Île-de-France"
        suggestions={LOCATION_SUGGESTIONS}
      />

      <ArrayTagEditor
        label="Mots-clés"
        items={criteria.keywords ?? []}
        onChange={(v) => update({ keywords: v })}
        placeholder="ex. levée de fonds"
        suggestions={KEYWORD_SUGGESTIONS}
      />

      <ArrayTagEditor
        label="Signaux prioritaires"
        items={criteria.signal_priorities ?? []}
        onChange={(v) => update({ signal_priorities: v as SignalType[] })}
        variant="accent"
        placeholder="ex. cession_entreprise"
        displayLabel={(v) => SIGNAL_LABELS[v as SignalType] ?? v}
        suggestions={SIGNAL_SUGGESTIONS}
      />

      <NumericRangeField
        label="Chiffre d'affaires"
        unit="€"
        min={criteria.ca_min}
        max={criteria.ca_max}
        onChange={({ min, max }) => update({ ca_min: min, ca_max: max })}
      />

      <NumericRangeField
        label="Effectif salarié"
        min={criteria.effectif_min}
        max={criteria.effectif_max}
        onChange={({ min, max }) => update({ effectif_min: min, effectif_max: max })}
      />

      <NumericRangeField
        label="Âge dirigeant"
        unit="ans"
        min={criteria.age_min}
        max={criteria.age_max}
        onChange={({ min, max }) => update({ age_min: min, age_max: max })}
      />

      {/* Niveau patrimonial */}
      <div>
        <p style={groupLabelStyle}>Niveau patrimonial</p>
        <div className="flex gap-2 flex-wrap mt-2">
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
    color: active ? '#FDFAF5' : 'var(--color-text)',
    border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
    cursor: 'pointer',
  }
}
