'use client'
import { useState } from 'react'
import { Users, RefreshCw } from 'lucide-react'
import { ProspectTable } from './prospect-table'
import { SearchLauncher } from './search-launcher'
import { ProspectDetailSheet } from './prospect-detail-sheet'
import type { Icp, Prospect } from '@/lib/types'

interface Props {
  icp: Icp | null
  initialProspects: Prospect[]
}

export function ProspectsClientPage({ icp, initialProspects }: Props) {
  const [prospects, setProspects] = useState<Prospect[]>(initialProspects)
  const [selected, setSelected] = useState<Prospect | null>(null)

  async function refreshProspects() {
    const res = await fetch('/api/prospects?per_page=50')
    const data = await res.json()
    setProspects(data.prospects ?? [])
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={24} />
            Prospects
          </h1>
          <p className="text-gray-500 mt-1">{prospects.length} prospect{prospects.length > 1 ? 's' : ''} enrichis</p>
        </div>
        <button
          onClick={refreshProspects}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <RefreshCw size={14} />
          Actualiser
        </button>
      </div>

      {icp ? (
        <div className="mb-6">
          <SearchLauncher icpId={icp.id} criteria={icp.parsed_criteria} onComplete={refreshProspects} />
        </div>
      ) : (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          Configurez d&apos;abord votre ICP pour lancer une recherche de prospects.{' '}
          <a href="/icp" className="underline font-medium">Créer mon ICP →</a>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <ProspectTable prospects={prospects} onSelect={setSelected} />
      </div>

      {selected && (
        <ProspectDetailSheet
          prospect={selected}
          onClose={() => setSelected(null)}
          onStageChange={async (stage) => {
            await fetch(`/api/prospects/${selected.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ crm_stage: stage }),
            })
            setSelected({ ...selected, crm_stage: stage as Prospect['crm_stage'] })
            setProspects(prev => prev.map(p => p.id === selected.id ? { ...p, crm_stage: stage as Prospect['crm_stage'] } : p))
          }}
        />
      )}
    </div>
  )
}
