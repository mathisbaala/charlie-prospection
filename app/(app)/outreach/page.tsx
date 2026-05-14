export default function OutreachPage() {
  return (
    <div style={{ padding: '40px 48px' }}>
      <div style={{ marginBottom: 32 }}>
        <h1
          className="font-display"
          style={{
            fontSize: 36,
            fontWeight: 700,
            color: 'var(--color-text)',
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
          }}
        >
          Outreach
        </h1>
        <p
          style={{
            color: 'var(--color-muted)',
            fontSize: 14,
            marginTop: 8,
            maxWidth: 560,
          }}
        >
          Génération et envoi de messages personnalisés. Disponible en Phase 4.
        </p>
      </div>

      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          padding: 64,
          textAlign: 'center',
        }}
      >
        <p
          className="font-display"
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--color-text)',
            letterSpacing: '-0.01em',
          }}
        >
          Bientôt disponible
        </p>
        <p style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 6 }}>
          Connectez votre LinkedIn et votre boîte email pour activer cette section.
        </p>
      </div>
    </div>
  )
}
