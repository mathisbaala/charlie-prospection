'use client'
import {
  ExternalLink,
  Building2,
  TrendingUp,
  AlertTriangle,
  Home,
  MapPin,
  Stethoscope,
  Users2,
  BarChart3,
} from 'lucide-react'
import { SignalBadge } from './signal-badge'
import { Section, Stat, DataList, Row, ExternalLinkRow, euros, titleCase } from './_shared'
import type {
  Prospect,
  ProspectEnrichmentData,
  BodaccEvent,
  DvfTransaction,
  PatrimonyScoreBreakdown,
} from '@/lib/types'

interface Props {
  prospect: Prospect
}

const BREAKDOWN_LABELS: Array<{ key: keyof PatrimonyScoreBreakdown; label: string }> = [
  { key: 'patrimoine_professionnel', label: 'Patrimoine pro' },
  { key: 'patrimoine_immobilier', label: 'Patrimoine immo (inféré)' },
  { key: 'signaux_liquidite', label: 'Signaux liquidité' },
  { key: 'age_carriere', label: 'Âge / carrière' },
  { key: 'qualite_donnees', label: 'Qualité données' },
]

function BreakdownBar({ label, value }: { label: string; value: number }) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className="flex items-baseline justify-between" style={{ gap: 16 }}>
        <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>{label}</span>
        <span
          className="font-mono"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--color-text)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {clamped}
        </span>
      </div>
      <div
        style={{
          width: '100%',
          height: 6,
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: '100%',
            background: 'var(--color-accent)',
          }}
        />
      </div>
    </div>
  )
}

/**
 * Container-agnostic "Fiche" body — renders all data sections for a prospect.
 * Used inside both the slide-over `ProspectDetailSheet` and the inline
 * `PipelineDetailPanel`. The parent provides padding and the surface background.
 */
export function ProspectFicheContent({ prospect }: Props) {
  const ld = prospect.linkedin_data as Record<string, string>
  const ed = prospect.enrichment_data as ProspectEnrichmentData

  const prenom = ed?.dirigeant_prenom ?? ld?.prenom ?? ''
  const nom = ed?.dirigeant_nom ?? ld?.nom_de_famille ?? ''
  const personName = `${titleCase(prenom)} ${titleCase(nom)}`.trim() || 'Prospect'

  const breakdown = ed?.score_breakdown
  const facteursCles = ed?.facteurs_cles

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Cartographie patrimoniale — uniquement patrimoine inféré du dirigeant */}
      {(ed?.patrimoine_total_estime ||
        ed?.valeur_entreprise_estimee ||
        ed?.revenus_implicites_estimes) && (
        <Section icon={<TrendingUp size={13} />} label="Cartographie patrimoniale">
          <div className="grid grid-cols-3" style={{ gap: 8 }}>
            {ed?.valeur_entreprise_estimee && (
              <Stat label="Valeur entreprise" value={euros(ed.valeur_entreprise_estimee)} />
            )}
            {ed?.patrimoine_total_estime && (
              <Stat label="Patrimoine total" value={euros(ed.patrimoine_total_estime)} />
            )}
            {ed?.revenus_implicites_estimes && (
              <Stat
                label="Revenus est."
                value={`${euros(ed.revenus_implicites_estimes)}/an`}
              />
            )}
          </div>
          {ld?.raison_score && (
            <p
              style={{
                fontSize: 12,
                color: 'var(--color-muted)',
                fontStyle: 'italic',
                marginTop: 8,
              }}
            >
              {ld.raison_score}
            </p>
          )}
        </Section>
      )}

      {/* Détail du score — breakdown 5 axes */}
      {breakdown && (
        <Section icon={<BarChart3 size={13} />} label="Détail du score patrimonial">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {BREAKDOWN_LABELS.map(({ key, label }) => (
              <BreakdownBar key={key} label={label} value={breakdown[key]} />
            ))}
          </div>
          {facteursCles && facteursCles.length > 0 && (
            <ul
              style={{
                marginTop: 14,
                paddingLeft: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                fontSize: 12,
                color: 'var(--color-text)',
                listStyleType: 'square',
              }}
            >
              {facteursCles.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* Société d'exercice */}
      <Section icon={<Building2 size={13} />} label="Société d'exercice">
        <DataList>
          {ed?.siren && <Row label="SIREN" value={ed.siren} mono />}
          {ed?.libelle_naf && <Row label="Activité" value={ed.libelle_naf} />}
          {ed?.date_creation_entreprise && (
            <Row
              label="Créée le"
              value={new Date(ed.date_creation_entreprise).toLocaleDateString('fr-FR')}
            />
          )}
          {ed?.tranche_effectifs && (
            <Row label="Effectifs" value={`${ed.tranche_effectifs} sal.`} />
          )}
          {ed?.adresse_entreprise && <Row label="Adresse" value={ed.adresse_entreprise} />}
        </DataList>
      </Section>

      {/* Dirigeant */}
      <Section icon={<Users2 size={13} />} label="Dirigeant">
        <DataList>
          <Row label="Nom" value={personName} />
          {(ed?.dirigeant_qualite || ld?.titre) && (
            <Row label="Fonction" value={ed?.dirigeant_qualite ?? ld?.titre ?? '—'} />
          )}
          {ed?.dirigeant_annee_naissance && (
            <Row label="Né(e) en" value={String(ed.dirigeant_annee_naissance)} mono />
          )}
        </DataList>
      </Section>

      {/* Finances Pappers */}
      {ed?.finances && ed.finances.length > 0 && (
        <Section icon={<BarChart3 size={13} />} label="Finances entreprise">
          <div className="grid grid-cols-2" style={{ gap: 8, marginBottom: 12 }}>
            {ed.chiffre_affaires_dernier != null && (
              <Stat label="Chiffre d'affaires" value={euros(ed.chiffre_affaires_dernier)} />
            )}
            {ed.resultat_dernier != null && (
              <Stat label="Résultat net" value={euros(ed.resultat_dernier)} />
            )}
            {ed.fonds_propres_dernier != null && (
              <Stat label="Fonds propres" value={euros(ed.fonds_propres_dernier)} />
            )}
            {ed.taux_marge_dernier != null && (
              <Stat label="Marge EBITDA" value={`${ed.taux_marge_dernier}%`} />
            )}
          </div>
          {ed.finances.length > 1 && (
            <p
              className="font-mono"
              style={{
                fontSize: 11,
                color: 'var(--color-muted)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              Évolution CA :{' '}
              {ed.finances
                .slice(0, 3)
                .reverse()
                .map(f => `${f.annee} ${euros(f.chiffre_affaires)}`)
                .join(' → ')}
            </p>
          )}
          {ed.capital_social && (
            <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>
              Capital social : {euros(ed.capital_social)}
            </p>
          )}
          {ed.procedure_collective_en_cours && (
            <div
              style={{
                marginTop: 10,
                padding: '10px 12px',
                background: 'var(--color-bg)',
                color: 'var(--color-error)',
                fontSize: 12,
                fontWeight: 500,
                borderLeft: '2px solid var(--color-error)',
              }}
            >
              ⚠ Procédure collective en cours
            </div>
          )}
        </Section>
      )}

      {/* Bénéficiaires effectifs */}
      {ed?.beneficiaires_effectifs && ed.beneficiaires_effectifs.length > 0 && (
        <Section
          icon={<Users2 size={13} />}
          label={`Bénéficiaires effectifs (${ed.beneficiaires_effectifs.length})`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ed.beneficiaires_effectifs.slice(0, 5).map((b, i) => (
              <div
                key={i}
                className="flex items-center justify-between"
                style={{
                  padding: '8px 12px',
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  fontSize: 12,
                }}
              >
                <span style={{ fontWeight: 500, color: 'var(--color-text)' }}>
                  {b.prenom ?? ''} {b.nom ?? ''}
                </span>
                <span
                  className="font-mono"
                  style={{
                    color: 'var(--color-muted)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {b.pourcentage_parts != null ? `${b.pourcentage_parts}%` : '—'}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* RPPS */}
      {ed?.rpps && (
        <Section icon={<Stethoscope size={13} />} label="Profil santé (RPPS)">
          <div
            style={{
              padding: '14px 16px',
              background: 'var(--color-bg)',
              borderLeft: '2px solid var(--color-accent)',
            }}
          >
            <DataList>
              {ed.rpps.profession && <Row label="Profession" value={ed.rpps.profession} />}
              {ed.rpps.savoir_faire && (
                <Row label="Spécialité" value={ed.rpps.savoir_faire} />
              )}
              {ed.rpps.mode_exercice && (
                <Row label="Mode d'exercice" value={ed.rpps.mode_exercice} />
              )}
              {ed.rpps.type_activite_liberale && (
                <Row label="Type activité" value={ed.rpps.type_activite_liberale} />
              )}
              {ed.potentiel_rpps && (
                <Row label="Potentiel" value={titleCase(ed.potentiel_rpps.replace('_', ' '))} />
              )}
              {ed.rpps.cabinet_nom && <Row label="Cabinet" value={ed.rpps.cabinet_nom} />}
              {ed.rpps.cabinet_commune && (
                <Row
                  label="Commune"
                  value={`${ed.rpps.cabinet_commune}${
                    ed.rpps.cabinet_code_postal ? ` (${ed.rpps.cabinet_code_postal})` : ''
                  }`}
                />
              )}
            </DataList>
          </div>
        </Section>
      )}

      {/* BODACC — signaux */}
      {ed?.bodacc_events && ed.bodacc_events.length > 0 && (
        <Section
          icon={<AlertTriangle size={13} />}
          label={`Signaux BODACC (${ed.bodacc_events.length})`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(ed.bodacc_events as BodaccEvent[])
              .slice(0, 5)
              .map((event: BodaccEvent, i: number) => (
                <div key={i} className="flex items-start" style={{ gap: 10 }}>
                  <SignalBadge type={event.type} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, color: 'var(--color-text)' }}>
                      {event.libelle}
                    </p>
                    <p
                      className="font-mono"
                      style={{
                        fontSize: 10,
                        color: 'var(--color-muted)',
                        marginTop: 2,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {new Date(event.date).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </Section>
      )}

      {/* Contexte marché immobilier — informatif, jamais patrimoine perso */}
      {ed?.contexte_marche_immo_local && (
        <Section icon={<MapPin size={13} />} label="Contexte marché immobilier">
          <div className="grid grid-cols-2" style={{ gap: 8, marginBottom: 8 }}>
            <Stat
              label={`Médiane ${ed.contexte_marche_immo_local.ville}`}
              value={euros(ed.contexte_marche_immo_local.mediane_zone)}
            />
            <Stat
              label="Ventes > 300k€"
              value={String(ed.contexte_marche_immo_local.nb_transactions_zone)}
            />
          </div>
          <p
            style={{
              fontSize: 11,
              color: 'var(--color-muted)',
              fontStyle: 'italic',
            }}
          >
            Indicateur du niveau de la zone — ce n&apos;est pas le patrimoine du dirigeant.
          </p>
        </Section>
      )}

      {/* DVF — transactions immobilières de zone */}
      {ed?.dvf_transactions && ed.dvf_transactions.length > 0 && (
        <Section icon={<Home size={13} />} label="Transactions immobilières (zone)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(ed.dvf_transactions as DvfTransaction[])
              .slice(0, 3)
              .map((t: DvfTransaction, i: number) => (
                <div
                  key={i}
                  style={{
                    padding: '10px 12px',
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      style={{ fontSize: 12, color: 'var(--color-text)', fontWeight: 500 }}
                    >
                      {t.type_local}{' '}
                      {t.surface_reelle_bati ? `${t.surface_reelle_bati}m²` : ''}
                    </span>
                    <span
                      className="font-mono"
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'var(--color-accent)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {euros(t.valeur_fonciere)}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: 11,
                      color: 'var(--color-muted)',
                      marginTop: 2,
                    }}
                  >
                    {t.commune} · {new Date(t.date_mutation).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              ))}
          </div>
        </Section>
      )}

      {/* Liens externes */}
      {(prospect.linkedin_url ||
        ed?.linkedin_search_url ||
        ed?.rpps?.doctolib_search_url) && (
        <Section icon={<ExternalLink size={13} />} label="Liens">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {prospect.linkedin_url ? (
              <ExternalLinkRow
                href={prospect.linkedin_url}
                label={`Voir profil LinkedIn de ${personName}`}
                variant="primary"
              />
            ) : ed?.linkedin_search_url ? (
              <ExternalLinkRow
                href={ed.linkedin_search_url}
                label={`Rechercher ${personName} sur LinkedIn`}
                variant="muted"
              />
            ) : null}
            {ed?.rpps?.doctolib_search_url && (
              <ExternalLinkRow
                href={ed.rpps.doctolib_search_url}
                label={`Trouver ${personName} sur Doctolib`}
                variant="primary"
              />
            )}
          </div>
        </Section>
      )}
    </div>
  )
}
