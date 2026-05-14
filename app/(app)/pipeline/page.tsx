export default function PipelinePage() {
  return (
    <div style={{ padding: '40px 48px' }}>
      <div className="mb-8">
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
          Pipeline
        </h1>
        <p className="mt-2" style={{ color: 'var(--color-muted)', fontSize: 14, maxWidth: 560 }}>
          Vos prospects qualifiés, classés par score patrimonial. Disponible en Phase 4.
        </p>
      </div>

      <div
        style={{
          background: 'var(--color-accent)',
          color: '#fff',
          padding: '12px 18px',
          fontSize: 11.5,
          fontWeight: 500,
          letterSpacing: '0.01em',
          marginBottom: 32,
        }}
      >
        En attendant, configurez votre ICP pour préparer la recherche automatique.
      </div>

      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 2,
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
          Aucun prospect pour le moment
        </p>
        <p
          className="mt-2"
          style={{ color: 'var(--color-muted)', fontSize: 13 }}
        >
          Définissez votre ICP, puis lancez une recherche pour peupler votre pipeline.
        </p>
      </div>
    </div>
  )
}
