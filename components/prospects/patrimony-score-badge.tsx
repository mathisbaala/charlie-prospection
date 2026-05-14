'use client'

interface Props {
  score: number | null
  size?: 'sm' | 'md'
}

function getColor(score: number): string {
  if (score >= 80) return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (score >= 60) return 'bg-blue-100 text-blue-800 border-blue-200'
  if (score >= 40) return 'bg-amber-100 text-amber-800 border-amber-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

function getLabel(score: number): string {
  if (score >= 80) return 'Prioritaire'
  if (score >= 60) return 'Fort'
  if (score >= 40) return 'Moyen'
  return 'Faible'
}

export function PatrimonyScoreBadge({ score, size = 'md' }: Props) {
  if (score === null) return <span className="text-xs text-gray-400">—</span>
  const color = getColor(score)
  const label = getLabel(score)
  return (
    <span className={`inline-flex items-center gap-1 border rounded-full font-semibold ${color} ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'}`}>
      <span>{score}</span>
      <span className="font-normal opacity-70">{label}</span>
    </span>
  )
}
