'use client'

// Three-tier signal classification:
// - hot: high-value money-in-motion events (cession, levée, transaction immo,
//   création holding) → copper accent
// - warm: relevant but lower-urgency life events (nouveau poste, installation,
//   retraite, divorce, succession, augmentation capital) → warning terracotta
// - info: ambient signals (post LinkedIn) → muted
const SIGNAL_CONFIG: Record<string, { label: string; tier: 'hot' | 'warm' | 'info' }> = {
  cession_entreprise:   { label: 'Cession',          tier: 'hot' },
  levee_fonds:          { label: 'Levée de fonds',   tier: 'hot' },
  creation_holding:     { label: 'Holding/SCI',      tier: 'hot' },
  transaction_immo:     { label: 'Transaction immo', tier: 'hot' },
  augmentation_capital: { label: 'Aug. capital',     tier: 'hot' },
  nouveau_poste:        { label: 'Nouveau poste',    tier: 'warm' },
  installation_cabinet: { label: 'Installation',     tier: 'warm' },
  retraite_imminente:   { label: 'Retraite',         tier: 'warm' },
  divorce:              { label: 'Divorce',          tier: 'warm' },
  succession:           { label: 'Succession',       tier: 'warm' },
  post_linkedin:        { label: 'Post LinkedIn',    tier: 'info' },
}

const TIER_STYLE: Record<'hot' | 'warm' | 'info', React.CSSProperties> = {
  hot: {
    background: 'var(--color-accent-dim)',
    color: 'var(--color-accent)',
    border: '1px solid var(--color-accent)',
  },
  warm: {
    background: 'var(--color-bg)',
    color: 'var(--color-warning)',
    border: '1px solid var(--color-warning)',
  },
  info: {
    background: 'var(--color-bg)',
    color: 'var(--color-muted)',
    border: '1px solid var(--color-border)',
  },
}

interface Props {
  type: string
  size?: 'sm' | 'md'
}

export function SignalBadge({ type, size = 'sm' }: Props) {
  const config = SIGNAL_CONFIG[type] ?? { label: type, tier: 'info' as const }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: size === 'sm' ? '2px 8px' : '3px 10px',
        fontSize: size === 'sm' ? 11 : 12,
        fontWeight: 500,
        borderRadius: 2,
        ...TIER_STYLE[config.tier],
      }}
    >
      {config.label}
    </span>
  )
}
