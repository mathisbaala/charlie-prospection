export default function SettingsPage() {
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
          Paramètres
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 14, marginTop: 8 }}>
          Cabinet, abonnement, intégrations.
        </p>
      </div>

      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          padding: 32,
        }}
      >
        <p style={{ color: 'var(--color-muted)', fontSize: 13 }}>
          Réglages à venir.
        </p>
      </div>
    </div>
  )
}
