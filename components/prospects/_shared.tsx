'use client'
import { ExternalLink } from 'lucide-react'

// ── Formatters ──────────────────────────────────────────────────────

/**
 * Compact French euros: 12.4M€ / 850K€ / 9 999€ / "—"
 * Returns "—" for null/undefined/zero — use `euros0` if you want to format zero.
 */
export function euros(n: number | null | undefined): string {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M€`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K€`
  return `${n.toLocaleString('fr-FR')}€`
}

/** Title-case a string (lowercase then capitalize each word) */
export function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

// ── Layout primitives (container-agnostic) ──────────────────────────

/**
 * Section header with copper icon + uppercase label. Use inside any panel
 * (the slide-over sheet or the inline pipeline detail). Container-agnostic:
 * no padding/background — the parent provides those.
 */
export function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h3
        className="flex items-center"
        style={{
          gap: 6,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-muted)',
          marginBottom: 14,
        }}
      >
        <span style={{ color: 'var(--color-accent)', display: 'inline-flex' }}>{icon}</span>
        {label}
      </h3>
      {children}
    </section>
  )
}

/**
 * Stat tile: small uppercase label + large mono number. Use in grids for
 * cartographie patrimoniale, finances entreprise, etc.
 */
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
      }}
    >
      <p
        style={{
          fontSize: 9.5,
          fontWeight: 700,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: 'var(--color-muted)',
        }}
      >
        {label}
      </p>
      <p
        className="font-mono"
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--color-text)',
          marginTop: 4,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </p>
    </div>
  )
}

/** Vertical stack of label/value rows */
export function DataList({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{children}</div>
}

/** Single label/value row inside a DataList */
export function Row({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between" style={{ gap: 16 }}>
      <span style={{ fontSize: 12, color: 'var(--color-muted)', flexShrink: 0 }}>{label}</span>
      <span
        className={mono ? 'font-mono' : ''}
        style={{
          fontSize: 13,
          color: 'var(--color-text)',
          textAlign: 'right',
          fontVariantNumeric: mono ? 'tabular-nums' : 'normal',
        }}
      >
        {value}
      </span>
    </div>
  )
}

/** Primary or muted external link row (LinkedIn, Doctolib, etc.) */
export function ExternalLinkRow({
  href,
  label,
  variant,
}: {
  href: string
  label: string
  variant: 'primary' | 'muted'
}) {
  const accent = variant === 'primary' ? 'var(--color-accent)' : 'var(--color-muted)'
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center transition-colors"
      style={{
        gap: 8,
        padding: '10px 12px',
        background: variant === 'primary' ? 'var(--color-accent-dim)' : 'var(--color-bg)',
        border: `1px solid ${
          variant === 'primary' ? 'var(--color-accent)' : 'var(--color-border)'
        }`,
        borderRadius: 2,
        fontSize: 13,
        color: variant === 'primary' ? 'var(--color-accent)' : 'var(--color-text)',
        fontWeight: variant === 'primary' ? 600 : 400,
      }}
    >
      <ExternalLink size={14} style={{ color: accent }} />
      <span style={{ flex: 1 }}>{label}</span>
    </a>
  )
}
