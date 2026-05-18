'use client'
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { SearchCandidate } from '@/lib/types'

export interface SearchHistoryEntry {
  id: string
  searchedAt: string
  personaId: string
  personaName: string
  candidateCount: number
  candidates: SearchCandidate[]
  filteredCount: number
  filterBreakdown: Record<string, number>
  quotaPappers: { count: number; cap: number; remaining: number } | null
}

interface RechercheContextValue {
  selectedPersonaId: string | null
  setSelectedPersonaId: (id: string | null) => void
  candidates: SearchCandidate[]
  setCandidates: React.Dispatch<React.SetStateAction<SearchCandidate[]>>
  filteredCount: number
  setFilteredCount: React.Dispatch<React.SetStateAction<number>>
  filterBreakdown: Record<string, number>
  setFilterBreakdown: React.Dispatch<React.SetStateAction<Record<string, number>>>
  selected: Set<string>
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>
  loading: boolean
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
  adding: boolean
  setAdding: React.Dispatch<React.SetStateAction<boolean>>
  error: string | null
  setError: React.Dispatch<React.SetStateAction<string | null>>
  addedSummary: string | null
  setAddedSummary: React.Dispatch<React.SetStateAction<string | null>>
  quotaPappers: { count: number; cap: number; remaining: number } | null
  setQuotaPappers: React.Dispatch<React.SetStateAction<{ count: number; cap: number; remaining: number } | null>>
  history: SearchHistoryEntry[]
  addToHistory: (entry: Omit<SearchHistoryEntry, 'id' | 'searchedAt'>) => void
  restoreFromHistory: (entry: SearchHistoryEntry) => void
}

const RechercheContext = createContext<RechercheContextValue | null>(null)

const HISTORY_KEY = 'charlie-search-history'
const MAX_HISTORY = 5

function loadHistory(): SearchHistoryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? (JSON.parse(raw) as SearchHistoryEntry[]) : []
  } catch {
    return []
  }
}

function saveHistory(entries: SearchHistoryEntry[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries))
  } catch {
    // localStorage quota dépassé — on ignore silencieusement
  }
}

export function RechercheProvider({ children }: { children: ReactNode }) {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<SearchCandidate[]>([])
  const [filteredCount, setFilteredCount] = useState(0)
  const [filterBreakdown, setFilterBreakdown] = useState<Record<string, number>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addedSummary, setAddedSummary] = useState<string | null>(null)
  const [quotaPappers, setQuotaPappers] = useState<{ count: number; cap: number; remaining: number } | null>(null)
  const [history, setHistory] = useState<SearchHistoryEntry[]>([])

  useEffect(() => {
    setHistory(loadHistory())
  }, [])

  const addToHistory = useCallback((entry: Omit<SearchHistoryEntry, 'id' | 'searchedAt'>) => {
    const newEntry: SearchHistoryEntry = {
      ...entry,
      id: crypto.randomUUID(),
      searchedAt: new Date().toISOString(),
    }
    setHistory((prev) => {
      const updated = [newEntry, ...prev].slice(0, MAX_HISTORY)
      saveHistory(updated)
      return updated
    })
  }, [])

  const restoreFromHistory = useCallback((entry: SearchHistoryEntry) => {
    setSelectedPersonaId(entry.personaId)
    setCandidates(entry.candidates)
    setFilteredCount(entry.filteredCount)
    setFilterBreakdown(entry.filterBreakdown)
    setSelected(new Set())
    setError(null)
    setAddedSummary(null)
    setQuotaPappers(entry.quotaPappers)
  }, [])

  return (
    <RechercheContext.Provider
      value={{
        selectedPersonaId, setSelectedPersonaId,
        candidates, setCandidates,
        filteredCount, setFilteredCount,
        filterBreakdown, setFilterBreakdown,
        selected, setSelected,
        loading, setLoading,
        adding, setAdding,
        error, setError,
        addedSummary, setAddedSummary,
        quotaPappers, setQuotaPappers,
        history, addToHistory, restoreFromHistory,
      }}
    >
      {children}
    </RechercheContext.Provider>
  )
}

export function useRecherche() {
  const ctx = useContext(RechercheContext)
  if (!ctx) throw new Error('useRecherche must be used inside RechercheProvider')
  return ctx
}
