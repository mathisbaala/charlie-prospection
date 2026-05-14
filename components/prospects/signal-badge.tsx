'use client'

const SIGNAL_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  cession_entreprise:   { label: 'Cession',         color: 'bg-red-100 text-red-700',       icon: '🏭' },
  levee_fonds:          { label: 'Levée de fonds',  color: 'bg-violet-100 text-violet-700', icon: '🚀' },
  creation_holding:     { label: 'Holding/SCI',     color: 'bg-blue-100 text-blue-700',     icon: '🏗️' },
  transaction_immo:     { label: 'Transaction immo', color: 'bg-green-100 text-green-700',  icon: '🏠' },
  nouveau_poste:        { label: 'Nouveau poste',   color: 'bg-sky-100 text-sky-700',       icon: '💼' },
  installation_cabinet: { label: 'Installation',    color: 'bg-teal-100 text-teal-700',     icon: '🏥' },
  post_linkedin:        { label: 'Post LinkedIn',   color: 'bg-cyan-100 text-cyan-700',     icon: '📢' },
  retraite_imminente:   { label: 'Retraite',        color: 'bg-orange-100 text-orange-700', icon: '⏰' },
  divorce:              { label: 'Divorce',         color: 'bg-pink-100 text-pink-700',     icon: '⚖️' },
  succession:           { label: 'Succession',      color: 'bg-purple-100 text-purple-700', icon: '📜' },
  augmentation_capital: { label: 'Aug. capital',    color: 'bg-indigo-100 text-indigo-700', icon: '📈' },
}

interface Props {
  type: string
  size?: 'sm' | 'md'
}

export function SignalBadge({ type, size = 'sm' }: Props) {
  const config = SIGNAL_CONFIG[type] ?? { label: type, color: 'bg-gray-100 text-gray-700', icon: '📌' }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${config.color} ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'}`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  )
}
