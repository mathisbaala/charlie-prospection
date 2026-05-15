'use client'

interface UseCase {
  score: number
  title: string
  description: string
}

const USE_CASES: readonly UseCase[] = [
  {
    score: 87,
    title: 'Chirurgiens proches de la retraite',
    description: 'NAF santé, 55+ ans, Île-de-France',
  },
  {
    score: 73,
    title: 'Vendeurs récents BODACC',
    description: 'Cession de société, liquidités disponibles',
  },
  {
    score: 91,
    title: 'Dirigeants PME 50+ ans',
    description: 'NAF industrie, ETI familiales, transmission',
  },
] as const

interface Props {
  onPick: (description: string) => void
}

export function UseCasesSection({ onPick }: Props) {
  return (
    <section
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '64px 24px 96px',
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
          marginBottom: 12,
          textAlign: 'center',
        }}
      >
        Exemples de cibles
      </p>
      <h2
        className="font-display"
        style={{
          fontSize: 'clamp(24px, 3vw, 32px)',
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
          color: 'var(--color-text)',
          textAlign: 'center',
          marginBottom: 40,
        }}
      >
        Quelques prospects que Charlie identifie aujourd'hui.
      </h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
        }}
      >
        {USE_CASES.map(uc => (
          <button
            key={uc.title}
            type="button"
            onClick={() => onPick(uc.title)}
            style={{
              textAlign: 'left',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderLeft: '2px solid var(--color-accent)',
              borderRadius: 2,
              padding: '20px 22px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background 120ms',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              minHeight: 168,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--color-accent-dim)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--color-surface)'
            }}
          >
            <span
              className="font-mono"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--color-accent)',
                letterSpacing: '0.02em',
              }}
            >
              SCORE {uc.score}
            </span>
            <h3
              className="font-display"
              style={{
                fontSize: 18,
                fontWeight: 600,
                color: 'var(--color-text)',
                letterSpacing: '-0.01em',
                lineHeight: 1.25,
                margin: 0,
              }}
            >
              {uc.title}
            </h3>
            <p
              style={{
                fontSize: 13,
                color: 'var(--color-muted)',
                lineHeight: 1.5,
                margin: 0,
                flex: 1,
              }}
            >
              {uc.description}
            </p>
            <span
              style={{
                fontSize: 12,
                color: 'var(--color-accent)',
                fontWeight: 500,
                marginTop: 4,
              }}
            >
              Voir un exemple →
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
