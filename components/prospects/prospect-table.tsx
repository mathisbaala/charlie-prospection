'use client'
import { ExternalLink, ChevronRight, Stethoscope, User } from 'lucide-react'
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

function euros(n: number | null | undefined): string {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M€`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K€`
  return `${n}€`
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
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
            <th className="pb-3 pr-4">Personne</th>
            <th className="pb-3 pr-4">Société</th>
            <th className="pb-3 pr-4">Localisation</th>
            <th className="pb-3 pr-4">CA</th>
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

            // Always person-first display
            const prenom = ed?.dirigeant_prenom ?? ld?.prenom ?? ''
            const nom = ed?.dirigeant_nom ?? ld?.nom_de_famille ?? ''
            const personName = `${titleCase(prenom)} ${titleCase(nom)}`.trim() || 'Prospect'
            const personRole = ed?.dirigeant_qualite ?? ld?.titre ?? '—'
            const companyName = ld?.entreprise ?? ed?.libelle_naf ?? '—'
            const companySector = ed?.libelle_naf ?? '—'
            const isHealth = !!ed?.rpps

            return (
              <tr
                key={prospect.id}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => onSelect(prospect)}
              >
                <td className="py-3 pr-2">
                  {isHealth
                    ? <Stethoscope size={14} className="text-rose-500" />
                    : <User size={14} className="text-gray-400" />
                  }
                </td>

                {/* PERSON — primary identity */}
                <td className="py-3 pr-4">
                  <p className="font-medium text-gray-900">{personName}</p>
                  <p className="text-xs text-gray-500">{personRole}</p>
                </td>

                {/* COMPANY — context */}
                <td className="py-3 pr-4">
                  <p className="text-gray-700">{titleCase(companyName)}</p>
                  <p className="text-xs text-gray-400">{companySector}</p>
                </td>

                {/* LOCATION */}
                <td className="py-3 pr-4">
                  <p className="text-gray-700">{ed?.ville ? titleCase(ed.ville) : '—'}</p>
                  <p className="text-xs text-gray-400">
                    {ed?.code_postal ? `${ed.code_postal.slice(0, 2)}` : ''}
                  </p>
                </td>

                {/* CA */}
                <td className="py-3 pr-4">
                  <p className="text-sm font-medium text-gray-700">{euros(ed?.chiffre_affaires_dernier)}</p>
                  {ed?.taux_marge_dernier != null && (
                    <p className="text-xs text-gray-400">marge {ed.taux_marge_dernier}%</p>
                  )}
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
