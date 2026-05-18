'use client'

interface Props {
  label: string
  unit?: string
  min: number | undefined
  max: number | undefined
  onChange: (next: { min: number | undefined; max: number | undefined }) => void
  step?: number
}

function parseValue(raw: string): number | undefined {
  const cleaned = raw.replace(/[^\d]/g, '')
  if (!cleaned) return undefined
  const n = parseInt(cleaned, 10)
  return Number.isFinite(n) ? n : undefined
}

export function NumericRangeField({ label, unit, min, max, onChange, step }: Props) {
  return (
    <div>
      <div className="flex items-center mb-2">
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-muted)',
          }}
        >
          {label}
          {unit && <span style={{ marginLeft: 6, opacity: 0.6 }}>({unit})</span>}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <NumInput value={min} placeholder="Min" step={step} onChange={(v) => onChange({ min: v, max })} />
        <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>→</span>
        <NumInput value={max} placeholder="Max" step={step} onChange={(v) => onChange({ min, max: v })} />
      </div>
    </div>
  )
}

function NumInput({
  value,
  placeholder,
  step,
  onChange,
}: {
  value: number | undefined
  placeholder: string
  step?: number
  onChange: (next: number | undefined) => void
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      value={value !== undefined ? String(value) : ''}
      onChange={(e) => onChange(parseValue(e.target.value))}
      step={step}
      style={{
        width: 120,
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 2,
        padding: '6px 10px',
        fontSize: 13,
        fontFamily: 'var(--font-mono, monospace)',
        fontVariantNumeric: 'tabular-nums',
        color: 'var(--color-text)',
        outline: 'none',
      }}
    />
  )
}
