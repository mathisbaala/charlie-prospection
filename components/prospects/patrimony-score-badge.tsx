'use client'

interface Props {
  score: number | null
  size?: 'sm' | 'md'
}

function getLabel(score: number): string {
  if (score >= 80) return 'Prioritaire'
  if (score >= 60) return 'Fort'
  if (score >= 40) return 'Moyen'
  return 'Faible'
}

function getStyle(score: number): React.CSSProperties {
  // High-priority scores (≥60) use copper accent — these are the signals
  // that matter. Lower scores stay neutral so they don't compete visually.
  if (score >= 60) {
    return {
      background: 'var(--color-accent-dim)',
      color: 'var(--color-accent)',
      border: '1px solid var(--color-accent)',
    }
  }
  return {
    background: 'var(--color-bg)',
    color: 'var(--color-muted)',
    border: '1px solid var(--color-border)',
  }
}

export function PatrimonyScoreBadge({ score, size = 'md' }: Props) {
  if (score === null) {
    return (
      <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>—</span>
    )
  }
  const label = getLabel(score)
  return (
    <span
      className="font-mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: size === 'sm' ? '2px 8px' : '4px 10px',
        fontSize: size === 'sm' ? 11 : 12,
        fontWeight: 600,
        borderRadius: 2,
        fontVariantNumeric: 'tabular-nums',
        ...getStyle(score),
      }}
    >
      <span>{score}</span>
      <span style={{ fontWeight: 400, opacity: 0.75 }}>{label}</span>
    </span>
  )
}
