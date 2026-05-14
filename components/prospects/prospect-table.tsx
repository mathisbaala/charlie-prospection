'use client'
import { ExternalLink, ChevronRight, Building2, User } from 'lucide-react'
import { PatrimonyScoreBadge } from './patrimony-score-badge'
import { SignalBadge } from './signal-badge'
import type { Prospect, ProspectEnrichmentData, BodaccEvent } from '@/lib/types'

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  new:        { label: 'Nouveau',     color: 'bg-gray-100 text-gray-700' },
  to_contact: { label: 'À contacter', color: 'bg-amber-100 text-amber-700' },
  contacted:  { label: 'Contacté',    color: 'bg-blue-100 text-blue-700' },
  meeting:    { label: 'RDV',         color: 'bg-purple-100 text-purple-700' },
  client:     { label: 'Client',      color: 'bg-emerald-100 text-emerald-700' },
  lost:       { label: 'Perdu',       color: 'bg-red-100 text-red-700' },
}

interface Props {
  prospects: Prospect[]
  onSelect: (prospect: Prospect) => void
}

export function ProspectTable({ prospects, onSelect }: Props) {
  if (prospects.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-lg font-medium">Aucun prospect</p>
        <p className="text-sm mt-1">Lancez une recherche depuis votre ICP pour trouver des prospects.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
            <th className="pb-3 pr-4 w-6"></th>
            <th className="pb-3 pr-4">Prospect</th>
            <th className="pb-3 pr-4">Contexte</th>
            <th className="pb-3 pr-4">Score patrimonial</th>
            <th className="pb-3 pr-4">Signaux</th>
            <th className="pb-3 pr-4">Stage</th>
            <th className="pb-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {prospects.map(prospect => {
            const ld = prospect.linkedin_data as Record<string, string>
            const ed = prospect.enrichment_data as ProspectEnrichmentData
            const stage = STAGE_LABELS[prospect.crm_stage] ?? STAGE_LABELS.new
            const signals = (ed?.bodacc_events as BodaccEvent[] | undefined)
              ?.filter(e => e.type !== 'autre')
              .slice(0, 2) ?? []
            const isPhysique = ld?.source_type === 'personne_physique'

            // Personne physique: the individual is the prospect, company is context
            // Personne morale: the company is the prospect, dirigeant is context
            const prospectMain = isPhysique ? (ld?.nom ?? 'Prospect') : (ld?.entreprise ?? 'Prospect')
            const prospectSub = isPhysique ? (ld?.titre ?? ed?.dirigeant_qualite ?? '—') : (ed?.libelle_naf ?? '—')
            const contextMain = isPhysique ? (ld?.entreprise ?? '—') : (ld?.nom ?? '—')
            const contextSub = isPhysique
              ? [ed?.ville, ed?.libelle_naf].filter(Boolean).join(' · ')
              : [ld?.titre ?? ed?.dirigeant_qualite, ed?.ville].filter(Boolean).join(' · ')

            return (
              <tr
                key={prospect.id}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => onSelect(prospect)}
              >
                {/* Type icon */}
                <td className="py-3 pr-2">
                  {isPhysique
                    ? <User size={14} className="text-rose-400" />
                    : <Building2 size={14} className="text-violet-400" />
                  }
                </td>

                {/* Main prospect entity */}
                <td className="py-3 pr-4">
                  <p className="font-medium text-gray-900">{prospectMain}</p>
                  <p className="text-xs text-gray-500">{prospectSub}</p>
                </td>

                {/* Context (company for physique, dirigeant for morale) */}
                <td className="py-3 pr-4">
                  <p className="text-gray-700">{contextMain}</p>
                  <p className="text-xs text-gray-400">{contextSub || '—'}</p>
                </td>

                <td className="py-3 pr-4">
                  <PatrimonyScoreBadge score={prospect.patrimony_score ?? null} />
                  {ed?.patrimoine_total_estime && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      ~{(ed.patrimoine_total_estime / 1_000_000).toFixed(1)}M€
                    </p>
                  )}
                </td>

                <td className="py-3 pr-4">
                  <div className="flex flex-wrap gap-1">
                    {signals.map((s, i) => (
                      <SignalBadge key={i} type={s.type} size="sm" />
                    ))}
                    {signals.length === 0 && <span className="text-xs text-gray-400">—</span>}
                  </div>
                </td>

                <td className="py-3 pr-4">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${stage.color}`}>
                    {stage.label}
                  </span>
                </td>

                <td className="py-3">
                  <div className="flex items-center gap-2">
                    {ed?.linkedin_search_url && (
                      <a
                        href={ed.linkedin_search_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-blue-600 hover:text-blue-800"
                        title="Rechercher sur LinkedIn"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                    <ChevronRight size={14} className="text-gray-400" />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
