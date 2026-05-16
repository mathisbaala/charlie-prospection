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
  showAdvanced: boolean
  onToggleAdvanced: () => void
  selectedSources: string[]
  onToggleSource: (s: string) => void
  nafCode: string
  onNafCodeChange: (v: string) => void
  discoveryDept: string
  onDiscoveryDeptChange: (v: string) => void
  discoveryDateDepuis: string
  onDiscoveryDateDepuisChange: (v: string) => void
  rppsProfession: 'Medecin' | 'Chirurgien-Dentiste' | ''
  onRppsProfessionChange: (v: 'Medecin' | 'Chirurgien-Dentiste' | '') => void
}

/**
 * Top bar of /recherche: persona picker + Lancer button + optional advanced sources panel.
 * Persona dropdown shows the saved targets from /cible.
 */
export function RechercheLauncher({
  personas,
  selectedPersonaId,
  onSelect,
  onLaunch,
  loading,
  disabled,
  showAdvanced,
  onToggleAdvanced,
  selectedSources,
  onToggleSource,
  nafCode,
  onNafCodeChange,
  discoveryDept,
  onDiscoveryDeptChange,
  discoveryDateDepuis,
  onDiscoveryDateDepuisChange,
  rppsProfession,
  onRppsProfessionChange,
}: Props) {
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
      <div className="flex items-end gap-3">
        <div style={{ flex: 1 }}>
          <label
            className="block"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-muted)',
              marginBottom: 6,
            }}
          >
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
              value={selectedPersonaId ?? ''}
              onChange={(e) => onSelect(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 2,
                padding: '10px 12px',
                fontSize: 14,
                fontFamily: 'inherit',
                outline: 'none',
              }}
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
          }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {loading ? 'Recherche…' : 'Lancer la recherche'}
        </button>
      </div>

      {/* Advanced sources toggle */}
      <div style={{ marginTop: 12 }}>
        <button
          type="button"
          onClick={onToggleAdvanced}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--color-muted)',
            padding: 0,
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {showAdvanced ? '▲' : '▼'} Sources avancées
        </button>
      </div>

      {showAdvanced && (
        <div
          style={{
            marginTop: 12,
            padding: 16,
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 2,
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-muted)',
              marginBottom: 10,
              marginTop: 0,
            }}
          >
            Sources de découverte
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { id: 'pappers-naf', label: 'Pappers NAF — entreprises par secteur' },
              { id: 'bodacc-cessions', label: 'BODACC cessions — dirigeants ayant vendu' },
              { id: 'rpps', label: 'RPPS — médecins et dentistes libéraux' },
            ].map(({ id, label }) => (
              <label
                key={id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}
              >
                <input
                  type="checkbox"
                  checked={selectedSources.includes(id)}
                  onChange={() => onToggleSource(id)}
                  style={{ accentColor: 'var(--color-accent)', width: 14, height: 14 }}
                />
                {label}
              </label>
            ))}
          </div>

          {selectedSources.includes('pappers-naf') && (
            <div style={{ marginTop: 12 }}>
              <label
                htmlFor="naf-code"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--color-muted)',
                  display: 'block',
                  marginBottom: 4,
                }}
              >
                Code NAF
              </label>
              <input
                id="naf-code"
                type="text"
                placeholder="86.21Z — médecins généralistes"
                value={nafCode}
                onChange={(e) => onNafCodeChange(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 2,
                  padding: '8px 10px',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          {selectedSources.includes('rpps') && (
            <div style={{ marginTop: 12 }}>
              <label
                htmlFor="rpps-profession"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--color-muted)',
                  display: 'block',
                  marginBottom: 4,
                }}
              >
                Profession RPPS
              </label>
              <select
                id="rpps-profession"
                value={rppsProfession}
                onChange={(e) =>
                  onRppsProfessionChange(e.target.value as 'Medecin' | 'Chirurgien-Dentiste' | '')
                }
                style={{
                  width: '100%',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 2,
                  padding: '8px 10px',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              >
                <option value="">Toutes</option>
                <option value="Medecin">Médecins</option>
                <option value="Chirurgien-Dentiste">Chirurgiens-Dentistes</option>
              </select>
            </div>
          )}

          {selectedSources.includes('bodacc-cessions') && (
            <div style={{ marginTop: 12 }}>
              <label
                htmlFor="bodacc-date"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--color-muted)',
                  display: 'block',
                  marginBottom: 4,
                }}
              >
                Cessions depuis
              </label>
              <input
                id="bodacc-date"
                type="date"
                value={discoveryDateDepuis}
                onChange={(e) => onDiscoveryDateDepuisChange(e.target.value)}
                style={{
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 2,
                  padding: '8px 10px',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <label
              htmlFor="discovery-dept"
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--color-muted)',
                display: 'block',
                marginBottom: 4,
              }}
            >
              Département (optionnel)
            </label>
            <input
              id="discovery-dept"
              type="text"
              placeholder="69, 75, 13…"
              value={discoveryDept}
              onChange={(e) => onDiscoveryDeptChange(e.target.value)}
              style={{
                width: 120,
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 2,
                padding: '8px 10px',
                fontSize: 13,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>

          <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 10, marginBottom: 0 }}>
            Budget max : ~41 jetons Pappers par recherche multi-source
          </p>
        </div>
      )}
    </div>
  )
}
