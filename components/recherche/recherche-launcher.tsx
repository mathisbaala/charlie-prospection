'use client'
import { Loader2, Search } from 'lucide-react'
import type { Icp } from '@/lib/types'

interface Props {
  personas: Icp[]
  selectedPersonaId: string | null
  onSelect: (id: string) => void
  onLaunch: () => void
  loading: boolean
  disabled?: boolean
  discoveryDept: string
  onDiscoveryDeptChange: (v: string) => void
  rppsProfession: 'Medecin' | 'Chirurgien-Dentiste' | ''
  onRppsProfessionChange: (v: 'Medecin' | 'Chirurgien-Dentiste' | '') => void
}

/**
 * Top bar of /recherche: persona picker + optional geo/profession filters + launch button.
 * When a departement is set, Charlie automatically cross-references RPPS and BODACC —
 * no source selection needed.
 */
export function RechercheLauncher({
  personas,
  selectedPersonaId,
  onSelect,
  onLaunch,
  loading,
  disabled,
  discoveryDept,
  onDiscoveryDeptChange,
  rppsProfession,
  onRppsProfessionChange,
}: Props) {
  const labelStyle = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: 'var(--color-muted)',
    display: 'block',
    marginBottom: 6,
  }

  const inputStyle = {
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    border: '1px solid var(--color-border)',
    borderRadius: 2,
    padding: '10px 12px',
    fontSize: 14,
    fontFamily: 'inherit',
    outline: 'none',
  }

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 2,
        padding: 20,
        marginBottom: 24,
      }}
    >
      <div className="flex items-end gap-3" style={{ flexWrap: 'wrap' }}>
        {/* Persona picker */}
        <div style={{ flex: '2 1 200px' }}>
          <label htmlFor="persona-select" style={labelStyle}>
            Cible
          </label>
          {personas.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-muted)', padding: '8px 0' }}>
              Aucune cible définie. Crée d&apos;abord une cible dans l&apos;onglet{' '}
              <a href="/cible" style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>
                Cible
              </a>
              .
            </p>
          ) : (
            <select
              id="persona-select"
              value={selectedPersonaId ?? ''}
              onChange={(e) => onSelect(e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
            >
              <option value="" disabled>
                Choisir une cible…
              </option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Département */}
        <div style={{ flex: '0 0 110px' }}>
          <label htmlFor="discovery-dept" style={labelStyle}>
            Département
          </label>
          <input
            id="discovery-dept"
            type="text"
            placeholder="69, 75…"
            value={discoveryDept}
            onChange={(e) => onDiscoveryDeptChange(e.target.value)}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        {/* Profession médicale (optionnel) */}
        <div style={{ flex: '1 1 160px' }}>
          <label htmlFor="rpps-profession" style={labelStyle}>
            Profession
          </label>
          <select
            id="rpps-profession"
            value={rppsProfession}
            onChange={(e) =>
              onRppsProfessionChange(e.target.value as 'Medecin' | 'Chirurgien-Dentiste' | '')
            }
            style={{ ...inputStyle, width: '100%' }}
          >
            <option value="">Toutes</option>
            <option value="Medecin">Médecins</option>
            <option value="Chirurgien-Dentiste">Chirurgiens-Dentistes</option>
          </select>
        </div>

        {/* Launch */}
        <button
          type="button"
          onClick={onLaunch}
          disabled={!selectedPersonaId || loading || disabled || personas.length === 0}
          className="inline-flex items-center gap-2 transition-opacity disabled:opacity-40"
          style={{
            background: 'var(--color-accent)',
            color: '#FDFAF5',
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 2,
            border: 'none',
            cursor: 'pointer',
            flexShrink: 0,
            height: 40,
            alignSelf: 'flex-end',
          }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {loading ? 'Recherche…' : 'Lancer'}
        </button>
      </div>

      {discoveryDept && (
        <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 10, marginBottom: 0 }}>
          Croisement automatique RPPS + BODACC sur le département {discoveryDept}
        </p>
      )}
    </div>
  )
}
