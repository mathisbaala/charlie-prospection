'use client'

import type { Preview } from '@/lib/preview-generator'

interface Props {
  query: string
  preview: Preview
  onSignup: () => void
}

export function BlurredPreview({ query, preview, onSignup }: Props) {
  return (
    <div
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '24px 24px 140px',
        width: '100%',
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-accent)',
          marginBottom: 8,
        }}
      >
        Recherche : « {query} »
      </p>
      <h2
        className="font-display"
        style={{
          fontSize: 'clamp(22px, 3vw, 28px)',
          fontWeight: 600,
          lineHeight: 1.2,
          letterSpacing: '-0.02em',
          color: 'var(--color-text)',
          marginBottom: 24,
        }}
      >
        Aperçu de vos prospects
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {preview.cards.map((card, i) => (
          <article
            key={i}
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderLeft: '2px solid var(--color-accent)',
              borderRadius: 2,
              padding: '16px 20px',
              display: 'grid',
              gridTemplateColumns: '64px 1fr',
              gap: 16,
              alignItems: 'start',
              opacity: 0,
              animation: `charlie-card-in 360ms ease-out ${i * 80}ms forwards`,
            }}
          >
            <span
              className="font-mono"
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: 'var(--color-accent)',
                lineHeight: 1,
              }}
            >
              {card.score}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <div
                aria-hidden
                className="font-display"
                style={{
                  filter: 'blur(6px)',
                  userSelect: 'none',
                  fontSize: 17,
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  letterSpacing: '-0.01em',
                  lineHeight: 1.2,
                }}
              >
                Nom Prénom Confidentiel
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                {card.city} · NAF {card.naf}
              </div>
              <div
                aria-hidden
                style={{
                  filter: 'blur(5px)',
                  userSelect: 'none',
                  fontSize: 12,
                  color: 'var(--color-muted)',
                  lineHeight: 1.4,
                }}
              >
                Société active depuis 2018, capital social, dirigeant principal, bilan disponible.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {card.signals.map(sig => (
                  <span
                    key={sig}
                    className="font-mono"
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      padding: '3px 7px',
                      border: '1px solid var(--color-accent)',
                      color: 'var(--color-accent)',
                      borderRadius: 2,
                    }}
                  >
                    {sig}
                  </span>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>

      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'var(--color-surface)',
          borderTop: '1px solid var(--color-border)',
          padding: '16px 24px',
          zIndex: 40,
          boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
            <p
              className="font-display"
              style={{
                fontSize: 17,
                fontWeight: 600,
                color: 'var(--color-text)',
                letterSpacing: '-0.01em',
                lineHeight: 1.3,
                margin: 0,
              }}
            >
              <span
                className="font-mono"
                style={{ color: 'var(--color-accent)' }}
              >
                {preview.count}
              </span>{' '}
              prospects identifiés.
            </p>
            <p style={{ fontSize: 13, color: 'var(--color-muted)', margin: '4px 0 0' }}>
              Créez votre compte pour les découvrir.
            </p>
          </div>
          <button
            type="button"
            onClick={onSignup}
            style={{
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 600,
              padding: '12px 22px',
              background: 'var(--color-text)',
              color: 'var(--color-bg)',
              border: 'none',
              borderRadius: 2,
              cursor: 'pointer',
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Commencer
          </button>
        </div>
      </div>

      <style>{`
        @keyframes charlie-card-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
