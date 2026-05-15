import Link from 'next/link'

export function PublicHeader() {
  return (
    <header
      style={{
        padding: '18px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div
        className="font-display"
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--color-text)',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          letterSpacing: '-0.01em',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--color-accent)',
            flexShrink: 0,
          }}
        />
        Charlie
        <span
          style={{
            color: 'var(--color-muted)',
            fontWeight: 300,
            fontFamily: 'var(--font-jakarta), system-ui, sans-serif',
          }}
        >
          ·
        </span>
        Prospection
      </div>

      <Link
        href="/login"
        className="charlie-connexion-link"
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--color-muted)',
          textDecoration: 'none',
          padding: '6px 10px',
          letterSpacing: '0.01em',
          transition: 'color 120ms',
        }}
      >
        Connexion
      </Link>
    </header>
  )
}
