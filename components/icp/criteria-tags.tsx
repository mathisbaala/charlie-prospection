'use client'
import { X } from 'lucide-react'
import type { ParsedIcpCriteria } from '@/lib/types'

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

function TagGroup({ label, items, color, onRemove }: {
  label: string
  items: string[]
  color: string
  onRemove: (item: string) => void
}) {
  if (!items.length) return null
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map(item => (
          <span key={item} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${color}`}>
            {SIGNAL_LABELS[item] ?? item}
            <button onClick={() => onRemove(item)} className="hover:opacity-70">
              <X size={12} />
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

  return (
    <div className="space-y-4">
      <TagGroup label="Rôles" items={criteria.roles} color="bg-indigo-100 text-indigo-800" onRemove={v => remove('roles', v)} />
      <TagGroup label="Secteurs" items={criteria.sectors} color="bg-blue-100 text-blue-800" onRemove={v => remove('sectors', v)} />
      <TagGroup label="Localisations" items={criteria.locations} color="bg-green-100 text-green-800" onRemove={v => remove('locations', v)} />
      <TagGroup label="Mots-clés" items={criteria.keywords} color="bg-gray-100 text-gray-700" onRemove={v => remove('keywords', v)} />
      <TagGroup label="Signaux prioritaires" items={criteria.signal_priorities} color="bg-amber-100 text-amber-800" onRemove={v => remove('signal_priorities', v)} />
      {criteria.patrimony_level && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Niveau patrimonial</p>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
            {{ standard: 'Standard (200K–1M€)', high: 'Élevé (1M–5M€)', very_high: 'Très élevé (5M€+)' }[criteria.patrimony_level]}
            <button onClick={() => onChange({ ...criteria, patrimony_level: undefined })} className="hover:opacity-70"><X size={12} /></button>
          </span>
        </div>
      )}
    </div>
  )
}
