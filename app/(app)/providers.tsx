'use client'
import { RechercheProvider } from '@/lib/recherche/context'
import type { ReactNode } from 'react'

export function AppProviders({ children }: { children: ReactNode }) {
  return <RechercheProvider>{children}</RechercheProvider>
}
