'use client'
import { useMemo, useState } from 'react'
import { FileText, FileSpreadsheet, FileDown, Lock } from 'lucide-react'
import type { PappersPremiumData, Prospect, ProspectEnrichmentData } from '@/lib/types'

interface Props {
  prospect: Prospect
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  // Pappers emits YYYY-MM-DD; render in short FR style.
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  return new Date(t).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

type Filter = 'all' | 'actes' | 'comptes' | 'bodacc'

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Tous' },
  { id: 'actes', label: 'Actes' },
  { id: 'comptes', label: 'Comptes' },
  { id: 'bodacc', label: 'BODACC' },
]

/**
 * "Actes" tab — renders the Pappers Premium payload (depots_actes, comptes
 * annuels, publications BODACC) with download links proxied through
 * `/api/pappers/document` so the api_token stays server-side.
 *
 * Empty state explains that Premium is opt-in (env flag) and that activation
 * doesn't multiply Pappers quota — same 1 jeton per call as standard.
 */
export function ProspectActesTab({ prospect }: Props) {
  const [filter, setFilter] = useState<Filter>('all')

  const ed = prospect.enrichment_data as ProspectEnrichmentData | null
  const premium = ed?.pappers_premium as PappersPremiumData | undefined

  const counts = useMemo(() => {
    if (!premium) return { actes: 0, comptes: 0, bodacc: 0 }
    return {
      actes: (premium.depots_actes ?? []).reduce(
        (sum, d) => sum + Math.max(1, (d.actes ?? []).length),
        0,
      ),
      comptes: (premium.comptes ?? []).length,
      bodacc: (premium.publications_bodacc ?? []).length,
    }
  }, [premium])

  if (!premium) {
    return <EmptyState />
  }

  const total = counts.actes + counts.comptes + counts.bodacc
  if (total === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.6 }}>
        Pappers Premium n’a remonté aucun acte, compte ou publication BODACC pour cette entreprise.
        Cela peut arriver pour les sociétés très récentes, les structures non immatriculées au RCS,
        ou si les dépôts récents n’ont pas encore été indexés.
      </p>
    )
  }

  const showActes = filter === 'all' || filter === 'actes'
  const showComptes = filter === 'all' || filter === 'comptes'
  const showBodacc = filter === 'all' || filter === 'bodacc'

  return (
    <div>
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2" style={{ marginBottom: 18 }}>
        {FILTERS.map((f) => {
          const active = f.id === filter
          const count =
            f.id === 'all'
              ? total
              : f.id === 'actes'
                ? counts.actes
                : f.id === 'comptes'
                  ? counts.comptes
                  : counts.bodacc
          if (f.id !== 'all' && count === 0) return null
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 500,
                background: active ? 'var(--color-accent)' : 'var(--color-bg)',
                color: active ? '#FDFAF5' : 'var(--color-text)',
                border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                borderRadius: 2,
                cursor: 'pointer',
              }}
            >
              {f.label}
              <span
                style={{
                  fontSize: 10,
                  opacity: 0.7,
                  fontFamily: 'var(--font-mono, monospace)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {showActes && premium.depots_actes && premium.depots_actes.length > 0 && (
        <Section title="Actes juridiques">
          {premium.depots_actes.map((d, i) => (
            <DepotActeRow key={`d-${i}`} depot={d} prospectId={prospect.id} />
          ))}
        </Section>
      )}

      {showComptes && premium.comptes && premium.comptes.length > 0 && (
        <Section title="Comptes annuels">
          {premium.comptes.map((c, i) => (
            <CompteRow key={`c-${i}`} compte={c} prospectId={prospect.id} />
          ))}
        </Section>
      )}

      {showBodacc && premium.publications_bodacc && premium.publications_bodacc.length > 0 && (
        <Section title="Publications BODACC" subtitle="Annonces légales — vue enrichie">
          {premium.publications_bodacc.map((p, i) => (
            <BodaccRow key={`b-${i}`} pub={p} />
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ marginBottom: 10 }}>
        <h3
          className="font-display"
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--color-text)',
            letterSpacing: '-0.005em',
            margin: 0,
          }}
        >
          {title}
        </h3>
        <p style={{ fontSize: 11, color: 'var(--color-muted)', margin: '2px 0 0' }}>{subtitle}</p>
      </div>
      <div>{children}</div>
    </div>
  )
}

function DepotActeRow({
  depot,
  prospectId,
}: {
  depot: PappersPremiumData['depots_actes'][number]
  prospectId: string
}) {
  const actes = depot.actes ?? []
  return (
    <div
      style={{
        padding: '12px 0',
        borderBottom: '1px solid var(--color-border)',
        display: 'grid',
        gridTemplateColumns: '110px 1fr auto',
        gap: 12,
        alignItems: 'start',
      }}
    >
      <div
        className="font-mono"
        style={{
          fontSize: 11,
          color: 'var(--color-muted)',
          fontVariantNumeric: 'tabular-nums',
          paddingTop: 2,
        }}
      >
        {formatDate(depot.date_depot)}
      </div>
      <div style={{ minWidth: 0 }}>
        {actes.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text)', margin: 0 }}>
            Dépôt d’actes (détail non disponible)
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {actes.map((a, j) => (
              <li
                key={j}
                style={{
                  fontSize: 13,
                  color: 'var(--color-text)',
                  marginBottom: j === actes.length - 1 ? 0 : 4,
                  lineHeight: 1.4,
                }}
              >
                <span style={{ fontWeight: 500 }}>{a.type ?? 'Acte juridique'}</span>
                {a.decision && (
                  <span style={{ color: 'var(--color-muted)', marginLeft: 6 }}>
                    — {a.decision}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {depot.nom_fichier_pdf && (
          <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 4, fontFamily: 'var(--font-mono, monospace)' }}>
            {depot.nom_fichier_pdf}
          </p>
        )}
      </div>
      <div>
        <DocLink
          disponible={depot.disponible}
          token={depot.token}
          filename={depot.nom_fichier_pdf ?? `acte-${depot.date_depot}.pdf`}
          prospectId={prospectId}
          icon={<FileText size={12} />}
          label="PDF"
        />
      </div>
    </div>
  )
}

function CompteRow({
  compte,
  prospectId,
}: {
  compte: PappersPremiumData['comptes'][number]
  prospectId: string
}) {
  return (
    <div
      style={{
        padding: '12px 0',
        borderBottom: '1px solid var(--color-border)',
        display: 'grid',
        gridTemplateColumns: '110px 1fr auto',
        gap: 12,
        alignItems: 'start',
      }}
    >
      <div
        className="font-mono"
        style={{
          fontSize: 11,
          color: 'var(--color-muted)',
          fontVariantNumeric: 'tabular-nums',
          paddingTop: 2,
        }}
      >
        {formatDate(compte.date_cloture)}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13, color: 'var(--color-text)', margin: 0, fontWeight: 500 }}>
          Comptes {compte.annee_cloture}
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--color-muted)',
              marginLeft: 8,
            }}
          >
            {compte.type_comptes === 'CS' ? 'Sociaux' : compte.type_comptes === 'CC' ? 'Consolidés' : compte.type_comptes}
          </span>
        </p>
        {compte.confidentialite && (
          <p
            style={{
              fontSize: 11,
              color: 'var(--color-muted)',
              margin: '3px 0 0',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Lock size={10} />
            Compte de résultat confidentiel
          </p>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <DocLink
          disponible={compte.disponible}
          token={compte.token}
          filename={compte.nom_fichier_pdf ?? `comptes-${compte.annee_cloture}.pdf`}
          prospectId={prospectId}
          icon={<FileText size={12} />}
          label="PDF"
        />
        {compte.disponible_xlsx && compte.token_xlsx && (
          <DocLink
            disponible={compte.disponible_xlsx}
            token={compte.token_xlsx}
            filename={compte.nom_fichier_xlsx ?? `comptes-${compte.annee_cloture}.xlsx`}
            prospectId={prospectId}
            icon={<FileSpreadsheet size={12} />}
            label="XLSX"
            variant="xlsx"
          />
        )}
      </div>
    </div>
  )
}

function BodaccRow({ pub }: { pub: PappersPremiumData['publications_bodacc'][number] }) {
  return (
    <div
      style={{
        padding: '12px 0',
        borderBottom: '1px solid var(--color-border)',
        display: 'grid',
        gridTemplateColumns: '110px 1fr',
        gap: 12,
        alignItems: 'start',
      }}
    >
      <div
        className="font-mono"
        style={{
          fontSize: 11,
          color: 'var(--color-muted)',
          fontVariantNumeric: 'tabular-nums',
          paddingTop: 2,
        }}
      >
        {formatDate(pub.date)}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13, color: 'var(--color-text)', margin: 0, fontWeight: 500 }}>
          {pub.type ?? 'Publication BODACC'}
          {pub.bodacc && (
            <span
              style={{
                fontSize: 10,
                color: 'var(--color-muted)',
                marginLeft: 8,
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              BODACC {pub.bodacc}
            </span>
          )}
        </p>
        {pub.description && (
          <p style={{ fontSize: 12, color: 'var(--color-muted)', margin: '3px 0 0', lineHeight: 1.4 }}>
            {pub.description}
          </p>
        )}
        {(pub.rcs || pub.greffe) && (
          <p style={{ fontSize: 10, color: 'var(--color-muted)', margin: '4px 0 0', fontFamily: 'var(--font-mono, monospace)' }}>
            {pub.rcs && `RCS ${pub.rcs}`}
            {pub.rcs && pub.greffe ? ' · ' : ''}
            {pub.greffe && `Greffe ${pub.greffe}`}
          </p>
        )}
      </div>
    </div>
  )
}

function DocLink({
  disponible,
  token,
  filename,
  prospectId,
  icon,
  label,
  variant,
}: {
  disponible: boolean
  token: string | undefined
  filename: string
  prospectId: string
  icon: React.ReactNode
  label: string
  variant?: 'xlsx'
}) {
  if (!disponible || !token) {
    return (
      <span
        title="Document non disponible chez Pappers"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          fontSize: 11,
          color: 'var(--color-muted)',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 2,
          cursor: 'not-allowed',
        }}
      >
        <Lock size={11} />
        Indispo
      </span>
    )
  }
  const params = new URLSearchParams({
    token,
    prospect_id: prospectId,
    filename,
  })
  if (variant) params.set('variant', variant)
  const href = `/api/pappers/document?${params.toString()}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 8px',
        fontSize: 11,
        fontWeight: 500,
        color: 'var(--color-accent)',
        background: 'var(--color-accent-dim)',
        border: '1px solid var(--color-accent-dim)',
        borderRadius: 2,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--color-accent)'
        e.currentTarget.style.color = '#FDFAF5'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--color-accent-dim)'
        e.currentTarget.style.color = 'var(--color-accent)'
      }}
    >
      {icon}
      {label}
      <FileDown size={11} />
    </a>
  )
}

function EmptyState() {
  return (
    <div
      style={{
        padding: '24px 20px',
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 2,
      }}
    >
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: 'var(--color-muted)',
          margin: 0,
          marginBottom: 8,
        }}
      >
        Pappers Premium désactivé
      </p>
      <p style={{ fontSize: 13, color: 'var(--color-text)', margin: 0, lineHeight: 1.55 }}>
        Les actes juridiques, comptes annuels détaillés et publications BODACC enrichies viennent du
        payload Premium Pappers. Cette fiche a été enrichie sans ce flag activé, donc ces données ne
        sont pas remontées.
      </p>
      <p style={{ fontSize: 12, color: 'var(--color-muted)', margin: '10px 0 0', lineHeight: 1.55 }}>
        Activation : passer{' '}
        <code
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            background: 'var(--color-surface)',
            padding: '1px 5px',
            fontSize: 11,
            border: '1px solid var(--color-border)',
            borderRadius: 2,
          }}
        >
          PAPPERS_PREMIUM_ENABLED=1
        </code>{' '}
        en environnement. Coût identique (1 jeton par appel), aucune multiplication de la
        consommation Pappers.
      </p>
    </div>
  )
}
