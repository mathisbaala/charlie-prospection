'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PublicHeader } from './public-header'
import { LandingHero, type LandingHeroHandle } from './landing-hero'
import { UseCasesSection } from './use-cases-section'
import { BlurredPreview } from './blurred-preview'
import { LoadingOverlay } from './loading-overlay'
import { storePendingDescription } from '@/lib/pending-description'
import { generatePreview, type Preview } from '@/lib/preview-generator'

const LOADING_PHASES = [
  'Analyse de votre demande par l’IA…',
  'Extraction des rôles, secteurs et localisations…',
  'Conversion en filtres NAF et départements…',
  'Création de votre première cible…',
] as const

const ANIMATION_TOTAL_MS = 6000

type Phase = 'idle' | 'parsing' | 'reveal'

export function LandingPublic() {
  const router = useRouter()
  const heroRef = useRef<LandingHeroHandle>(null)

  const [description, setDescription] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [loadingPhase, setLoadingPhase] = useState(0)
  const [preview, setPreview] = useState<Preview | null>(null)

  useEffect(() => {
    if (phase !== 'parsing') return
    const id = setInterval(() => {
      setLoadingPhase(p => (p + 1) % LOADING_PHASES.length)
    }, 1500)
    return () => clearInterval(id)
  }, [phase])

  useEffect(() => {
    if (phase !== 'parsing') return
    const t = setTimeout(() => {
      setPreview(generatePreview(description))
      setPhase('reveal')
    }, ANIMATION_TOTAL_MS)
    return () => clearTimeout(t)
  }, [phase, description])

  function handleSubmit() {
    if (!description.trim() || phase !== 'idle') return
    setLoadingPhase(0)
    setPhase('parsing')
  }

  function handlePickUseCase(desc: string) {
    if (phase !== 'idle') return
    setDescription(desc)
    heroRef.current?.scrollIntoView()
    setTimeout(() => heroRef.current?.focus(), 320)
  }

  function handleSignup() {
    storePendingDescription(description)
    router.push('/signup')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <PublicHeader />

      {phase === 'reveal' && preview ? (
        <main style={{ flex: 1, paddingTop: 32 }}>
          <BlurredPreview query={description} preview={preview} onSignup={handleSignup} />
        </main>
      ) : (
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <LandingHero
            ref={heroRef}
            description={description}
            onDescriptionChange={setDescription}
            onSubmit={handleSubmit}
            disabled={phase !== 'idle'}
          />
          <UseCasesSection onPick={handlePickUseCase} />
        </main>
      )}

      {phase === 'parsing' && <LoadingOverlay message={LOADING_PHASES[loadingPhase]} />}
    </div>
  )
}
