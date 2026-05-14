'use client'
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import Link from 'next/link'
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
    <div style={{ padding: '40px 48px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <div>
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
            Prospects
          </h1>
          <p
            className="font-mono"
            style={{
              fontSize: 12,
              color: 'var(--color-muted)',
              marginTop: 6,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.02em',
            }}
          >
            {prospects.length} prospect{prospects.length > 1 ? 's' : ''} enrichi
            {prospects.length > 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={refreshProspects}
          className="flex items-center gap-2 transition-colors"
          style={{
            padding: '7px 12px',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--color-muted)',
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: 2,
            cursor: 'pointer',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'var(--color-text)'
            e.currentTarget.style.borderColor = 'var(--color-text)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--color-muted)'
            e.currentTarget.style.borderColor = 'var(--color-border)'
          }}
        >
          <RefreshCw size={13} />
          Actualiser
        </button>
      </div>

      {icp ? (
        <div style={{ marginBottom: 24 }}>
          <SearchLauncher
            icpId={icp.id}
            criteria={icp.parsed_criteria}
            onComplete={refreshProspects}
          />
        </div>
      ) : (
        <div
          style={{
            marginBottom: 24,
            padding: '14px 18px',
            background: 'var(--color-bg)',
            borderLeft: '2px solid var(--color-warning)',
            fontSize: 13,
            color: 'var(--color-text)',
          }}
        >
          Configurez d&apos;abord votre ICP pour lancer une recherche de prospects.{' '}
          <Link
            href="/icp"
            style={{ color: 'var(--color-accent)', fontWeight: 600 }}
            className="hover:underline"
          >
            Créer mon ICP →
          </Link>
        </div>
      )}

      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}
      >
        <ProspectTable prospects={prospects} onSelect={setSelected} />
      </div>

      {selected && (
        <ProspectDetailSheet
          prospect={selected}
          onClose={() => setSelected(null)}
          onStageChange={async stage => {
            await fetch(`/api/prospects/${selected.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ crm_stage: stage }),
            })
            setSelected({ ...selected, crm_stage: stage as Prospect['crm_stage'] })
            setProspects(prev =>
              prev.map(p =>
                p.id === selected.id ? { ...p, crm_stage: stage as Prospect['crm_stage'] } : p,
              ),
            )
          }}
        />
      )}
    </div>
  )
}
