'use client'

interface Props {
  message: string
}

export function LoadingOverlay({ message }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(243, 239, 230, 0.92)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 32,
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: '100%',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderLeft: '2px solid var(--color-accent)',
          padding: '28px 32px',
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-accent)',
            marginBottom: 12,
          }}
        >
          Création de votre cible
        </p>
        <p
          className="font-display"
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--color-text)',
            letterSpacing: '-0.01em',
            lineHeight: 1.25,
            minHeight: 56,
          }}
          key={message}
        >
          {message}
        </p>
        <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 16, lineHeight: 1.5 }}>
          Quelques secondes. Vous pourrez ensuite ajuster les filtres à la main avant de lancer la recherche.
        </p>
        <div
          style={{
            marginTop: 16,
            height: 2,
            background: 'var(--color-border)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'var(--color-accent)',
              animation: 'charlie-progress 2.4s ease-in-out infinite',
              transformOrigin: 'left',
            }}
          />
        </div>
      </div>
      <style>{`
        @keyframes charlie-progress {
          0%   { transform: scaleX(0);   transform-origin: left;  }
          50%  { transform: scaleX(1);   transform-origin: left;  }
          50.01% { transform: scaleX(1); transform-origin: right; }
          100% { transform: scaleX(0);   transform-origin: right; }
        }
      `}</style>
    </div>
  )
}
