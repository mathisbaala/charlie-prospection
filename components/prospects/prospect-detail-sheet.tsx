'use client'
import { ExternalLink, Building2, MapPin, TrendingUp, AlertTriangle, Home } from 'lucide-react'
import { PatrimonyScoreBadge } from './patrimony-score-badge'
import { SignalBadge } from './signal-badge'
import type { Prospect, ProspectEnrichmentData, BodaccEvent, DvfTransaction } from '@/lib/types'

const CRM_STAGES = ['new', 'to_contact', 'contacted', 'meeting', 'client', 'lost'] as const
const CRM_LABELS: Record<string, string> = {
  new: 'Nouveau', to_contact: 'À contacter', contacted: 'Contacté',
  meeting: 'RDV', client: 'Client', lost: 'Perdu',
}

interface Props {
  prospect: Prospect
  onClose: () => void
  onStageChange: (stage: string) => void
}

function euros(n: number | null | undefined): string {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M€`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K€`
  return `${n.toLocaleString('fr-FR')}€`
}

export function ProspectDetailSheet({ prospect, onClose, onStageChange }: Props) {
  const ld = prospect.linkedin_data as Record<string, string>
  const ed = prospect.enrichment_data as ProspectEnrichmentData
  const nom = ld?.nom ?? (`${ed?.dirigeant_prenom ?? ''} ${ed?.dirigeant_nom ?? ''}`.trim() || 'Prospect')
  const titre = ld?.titre ?? ed?.dirigeant_qualite ?? '—'
  const entreprise = ld?.entreprise ?? ed?.siren ?? '—'

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={onClose}>
      <div
        className="h-full w-[520px] bg-white shadow-2xl overflow-y-auto flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="flex items-start justify-between mb-3">
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-sm">✕ Fermer</button>
            <PatrimonyScoreBadge score={prospect.patrimony_score ?? null} size="md" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">{nom}</h2>
          <p className="text-gray-600 mt-0.5">{titre}</p>
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
            <span className="flex items-center gap-1"><Building2 size={12} />{entreprise}</span>
            {ed?.ville && <span className="flex items-center gap-1"><MapPin size={12} />{ed.ville}</span>}
          </div>
          {/* CRM Stage */}
          <div className="flex gap-1 mt-4 flex-wrap">
            {CRM_STAGES.map(stage => (
              <button
                key={stage}
                onClick={() => onStageChange(stage)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  prospect.crm_stage === stage
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {CRM_LABELS[stage]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 p-6 space-y-6">
          {/* Cartographie patrimoniale */}
          {(ed?.patrimoine_total_estime || ed?.valeur_entreprise_estimee || ed?.revenus_implicites_estimes) && (
            <section>
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <TrendingUp size={14} className="text-indigo-600" />
                Cartographie patrimoniale estimée
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {ed?.valeur_entreprise_estimee && (
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-blue-800">{euros(ed.valeur_entreprise_estimee)}</p>
                    <p className="text-xs text-blue-600 mt-0.5">Valeur entreprise</p>
                  </div>
                )}
                {ed?.patrimoine_immo_estime && (
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-green-800">{euros(ed.patrimoine_immo_estime)}</p>
                    <p className="text-xs text-green-600 mt-0.5">Immo estimé</p>
                  </div>
                )}
                {ed?.revenus_implicites_estimes && (
                  <div className="bg-amber-50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-amber-800">{euros(ed.revenus_implicites_estimes)}/an</p>
                    <p className="text-xs text-amber-600 mt-0.5">Revenus estimés</p>
                  </div>
                )}
              </div>
              {ed?.patrimoine_total_estime && (
                <div className="mt-2 p-3 bg-indigo-50 rounded-lg text-center">
                  <p className="text-sm font-semibold text-indigo-900">Patrimoine total estimé : <span className="text-lg font-bold">{euros(ed.patrimoine_total_estime)}</span></p>
                </div>
              )}
              {ld?.raison_score && (
                <p className="text-xs text-gray-500 mt-2 italic">{ld.raison_score}</p>
              )}
            </section>
          )}

          {/* Données entreprise */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <Building2 size={14} className="text-gray-600" />
              Données entreprise
            </h3>
            <div className="space-y-2 text-sm">
              {ed?.siren && <div className="flex justify-between"><span className="text-gray-500">SIREN</span><span className="font-mono">{ed.siren}</span></div>}
              {ed?.libelle_naf && <div className="flex justify-between"><span className="text-gray-500">Activité</span><span>{ed.libelle_naf}</span></div>}
              {ed?.date_creation_entreprise && <div className="flex justify-between"><span className="text-gray-500">Créée le</span><span>{new Date(ed.date_creation_entreprise).toLocaleDateString('fr-FR')}</span></div>}
              {ed?.tranche_effectifs && <div className="flex justify-between"><span className="text-gray-500">Effectifs</span><span>{ed.tranche_effectifs} sal.</span></div>}
              {ed?.adresse_entreprise && <div className="flex justify-between gap-4"><span className="text-gray-500">Adresse</span><span className="text-right">{ed.adresse_entreprise}</span></div>}
            </div>
          </section>

          {/* Signaux BODACC */}
          {ed?.bodacc_events && ed.bodacc_events.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <AlertTriangle size={14} className="text-amber-600" />
                Signaux BODACC ({ed.bodacc_events.length})
              </h3>
              <div className="space-y-2">
                {(ed.bodacc_events as BodaccEvent[]).slice(0, 5).map((event: BodaccEvent, i: number) => (
                  <div key={i} className="flex items-start gap-2">
                    <SignalBadge type={event.type} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700">{event.libelle}</p>
                      <p className="text-xs text-gray-400">{new Date(event.date).toLocaleDateString('fr-FR')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* DVF */}
          {ed?.dvf_transactions && ed.dvf_transactions.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <Home size={14} className="text-green-600" />
                Transactions immobilières zone
              </h3>
              <div className="space-y-2">
                {(ed.dvf_transactions as DvfTransaction[]).slice(0, 3).map((t: DvfTransaction, i: number) => (
                  <div key={i} className="p-2 bg-green-50 rounded-lg text-xs">
                    <div className="flex justify-between font-medium">
                      <span>{t.type_local} {t.surface_reelle_bati ? `${t.surface_reelle_bati}m²` : ''}</span>
                      <span className="text-green-800 font-bold">{euros(t.valeur_fonciere)}</span>
                    </div>
                    <div className="text-gray-500 mt-0.5">{t.commune} · {new Date(t.date_mutation).toLocaleDateString('fr-FR')}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* LinkedIn */}
          {ed?.linkedin_search_url && (
            <section>
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <ExternalLink size={14} className="text-blue-600" />
                LinkedIn
              </h3>
              <a
                href={ed.linkedin_search_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 p-3 bg-blue-50 rounded-lg border border-blue-100"
              >
                <ExternalLink size={14} />
                Rechercher {nom} sur LinkedIn
              </a>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
