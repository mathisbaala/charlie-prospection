'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const SUGGESTIONS = [
  'Comptables en Gironde',
  'Ressources humaines PME',
  'CEO engrais bio',
  'Vétérinaires diplômés',
  'Responsables achats',
] as const

const PLACEHOLDER = 'Ex : Chirurgiens lyonnais proches de la retraite…'

const LOADING_PHASES = [
  'Analyse de votre demande par l’IA…',
  'Extraction des rôles, secteurs et localisations…',
  'Conversion en filtres NAF et départements…',
  'Création de votre première cible…',
] as const

interface Props {
  initialDescription?: string
}

type Phase = 'idle' | 'parsing' | 'done'

export function HeroSearch({ initialDescription = '' }: Props) {
  const router = useRouter()
  const [description, setDescription] = useState(initialDescription)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [loadingPhase, setLoadingPhase] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)

  // ── Pretext: optional progressive enhancement for the heading layout.
  // Loaded lazily on the client so SSR isn't blocked by the CDN fetch.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const heading = headingRef.current
    if (!heading) return

    let canceled = false
    let observer: ResizeObserver | null = null

    const run = async () => {
      try {
        await document.fonts.ready
        // Dynamic import via a runtime-only URL — typed loosely on purpose
        // since we ship without the package in node_modules.
        type PretextModule = {
          prepare: (text: string, font: string) => unknown
          layout: (handle: unknown, width: number, lineHeight: number) => { height: number }
        }
        const mod = (await import(
          /* @vite-ignore */
          /* webpackIgnore: true */
          'https://esm.sh/@chenglou/pretext' as string
        )) as PretextModule

        if (canceled || !heading.isConnected) return
        const text = heading.textContent ?? ''
        if (!text.trim()) return
        const handle = mod.prepare(text, getComputedStyle(heading).font)
        const apply = () => {
          if (canceled || !heading.isConnected) return
          const lineHeight = parseFloat(getComputedStyle(heading).lineHeight)
          const { height } = mod.layout(handle, heading.clientWidth, lineHeight)
          heading.style.height = `${height}px`
        }
        apply()
        observer = new ResizeObserver(apply)
        observer.observe(heading)
      } catch {
        // Pretext is a nice-to-have. Heading still renders correctly without it.
      }
    }
    void run()
    return () => {
      canceled = true
      observer?.disconnect()
    }
  }, [])

  // Cycle through loading messages every 1.5s while the persona is being created.
  useEffect(() => {
    if (phase !== 'parsing') return
    const id = setInterval(() => {
      setLoadingPhase(p => (p + 1) % LOADING_PHASES.length)
    }, 1500)
    return () => clearInterval(id)
  }, [phase])

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!description.trim() || phase !== 'idle') return
    setError(null)
    setPhase('parsing')
    setLoadingPhase(0)
    try {
      // Create a new persona via the Cible API. Claude parses + a persona
      // row is created, then the user lands on /recherche to confirm/refine
      // their filters and run the search. We no longer auto-run an expensive
      // enrichment from the landing page — search is now opt-in.
      const res = await fetch('/api/personas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erreur lors de la création de la cible')

      setPhase('done')
      router.push(`/recherche?persona=${data.persona.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setPhase('idle')
    }
  }

  const isLoading = phase === 'parsing'

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          padding: '18px 28px',
          display: 'flex',
          alignItems: 'center',
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
      </header>

      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px 80px',
          maxWidth: 660,
          margin: '0 auto',
          width: '100%',
        }}
      >
        <h1
          ref={headingRef}
          className="font-display"
          style={{
            fontSize: 'clamp(36px, 5.5vw, 52px)',
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: '-0.03em',
            textAlign: 'center',
            color: 'var(--color-text)',
            marginBottom: 14,
          }}
        >
          Qui cherchez-vous&nbsp;?
        </h1>
        <p
          style={{
            fontSize: 15,
            color: 'var(--color-muted)',
            textAlign: 'center',
            marginBottom: 32,
            lineHeight: 1.5,
          }}
        >
          Décrivez votre prospect idéal en langage naturel.
        </p>

        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <div
            style={{
              display: 'flex',
              width: '100%',
              border: '1px solid var(--color-border)',
              borderRadius: 2,
              background: 'var(--color-surface)',
              overflow: 'hidden',
              transition: 'border-color 120ms',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-text)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
          >
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={PLACEHOLDER}
              aria-label="Décrivez votre prospect idéal"
              disabled={isLoading}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontFamily: 'inherit',
                fontSize: 14,
                color: 'var(--color-text)',
                padding: '14px 16px',
                lineHeight: 1.4,
                minWidth: 0,
              }}
            />
            <button
              type="submit"
              disabled={isLoading || !description.trim()}
              style={{
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 600,
                padding: '0 24px',
                background: 'var(--color-text)',
                color: 'var(--color-bg)',
                border: 'none',
                cursor: isLoading || !description.trim() ? 'not-allowed' : 'pointer',
                letterSpacing: '0.01em',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                opacity: isLoading || !description.trim() ? 0.5 : 1,
                transition: 'opacity 100ms',
              }}
            >
              {phase === 'parsing' ? 'Création…' : 'Créer la cible'}
            </button>
          </div>
        </form>

        <div
          role="list"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            justifyContent: 'center',
            marginTop: 20,
          }}
        >
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              role="listitem"
              type="button"
              disabled={isLoading}
              onClick={() => setDescription(s)}
              style={{
                fontFamily: 'inherit',
                fontSize: 12.5,
                fontWeight: 500,
                padding: '6px 13px',
                border: '1px solid var(--color-border)',
                borderRadius: 2,
                background: 'transparent',
                color: 'var(--color-muted)',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                lineHeight: 1.3,
                transition: 'all 100ms',
                opacity: isLoading ? 0.5 : 1,
              }}
              onMouseEnter={e => {
                if (isLoading) return
                e.currentTarget.style.borderColor = 'var(--color-accent)'
                e.currentTarget.style.color = 'var(--color-accent)'
                e.currentTarget.style.background = 'var(--color-accent-dim)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--color-border)'
                e.currentTarget.style.color = 'var(--color-muted)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {error && (
          <p
            role="alert"
            style={{
              marginTop: 20,
              fontSize: 13,
              color: 'var(--color-error)',
              textAlign: 'center',
            }}
          >
            {error}
          </p>
        )}
      </main>

      {isLoading && <LoadingOverlay message={LOADING_PHASES[loadingPhase]} />}
    </div>
  )
}

function LoadingOverlay({ message }: { message: string }) {
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
