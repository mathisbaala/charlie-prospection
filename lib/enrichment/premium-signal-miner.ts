// Premium signal miner — parses `PappersPremiumData` (depots_actes, comptes,
// publications_bodacc) into typed signal rows ready to insert into
// `prospection_signals`.
//
// Rationale : the Premium payload is already persisted on the enrichment, so
// we don't pay an extra jeton to extract semantics. The firehose backfill
// (backfill_signals_for_prospect_v2) only sees `prospection_signals_inbox`,
// which is populated by daily crons that do NOT consume Premium data — so
// without this miner the Premium fields would stay dormant.
//
// Idempotency : every signal carries a deterministic `external_id` derived
// from the acte/compte/publication shape. The DB unique index
// `uq_prospection_signals_prospect_dedup` on (prospect_id, source, type,
// detected_at) catches duplicates, and `data.external_id` lets us debug
// which raw input produced which row.

import type { PappersPremiumData, PappersActe, PappersActeDepot, PappersCompte, PappersPublicationBodacc } from '@/lib/data-sources/pappers'
import type { InboxEventType } from '@/lib/types'

export interface PremiumSignalInsert {
  type: InboxEventType
  source: 'pappers'
  detected_at: string  // ISO timestamp
  data: {
    libelle: string
    external_id: string
    /** "actes" | "comptes" | "bodacc" — lets the UI route to the right tab. */
    premium_kind: 'actes' | 'comptes' | 'bodacc'
    raw?: Record<string, unknown>
  }
}

/**
 * Classify a single acte juridique into an InboxEventType. The Pappers `type`
 * field is free-text from the actes OCR pipeline, so we match case-insensitive
 * substrings ordered from most specific (cession parts / TUP) to least.
 */
export function classifyActe(acte: PappersActe): InboxEventType {
  const txt = `${acte.type ?? ''} ${acte.decision ?? ''}`.toLowerCase()

  // Order matters: "cession de parts" must be caught before generic "cession"
  // (Pappers sometimes returns just "cession" for vente fonds de commerce).
  if (txt.includes('cession') || txt.includes('vente de fonds') || txt.includes('transmission universelle')) {
    return 'cession'
  }
  if (txt.includes('procédure collective') || txt.includes('sauvegarde') || txt.includes('redressement') || txt.includes('liquidation')) {
    return 'procedure_collective'
  }
  if (txt.includes('augmentation') || txt.includes('réduction') || txt.includes('reduction') || (txt.includes('capital') && txt.includes('modif'))) {
    return 'modif_capital'
  }
  if (txt.includes('bénéficiaire') || txt.includes('beneficiaire') || txt.includes('démembrement') || txt.includes('demembrement')) {
    return 'modif_beneficiaire'
  }
  if (txt.includes('dissolution') || txt.includes('radiation')) {
    return 'radiation'
  }
  if (txt.includes('création') || txt.includes('creation') || txt.includes('constitution') || txt.includes('immatriculation')) {
    return 'creation'
  }
  if (txt.includes('modification') || txt.includes('statuts') || txt.includes('transfert')) {
    return 'modification'
  }
  return 'autre'
}

/**
 * Same approach for BODACC publications — the Pappers `type` field is closer
 * to a controlled vocabulary here (BODACC family of annonces), so the rules
 * are more deterministic.
 */
export function classifyBodaccPublication(pub: PappersPublicationBodacc): InboxEventType {
  const t = (pub.type ?? '').toLowerCase()
  const desc = (pub.description ?? '').toLowerCase()

  if (t.includes('vente') || t.includes('cession') || desc.includes('cession')) return 'cession'
  if (t.includes('procédure') || t.includes('procedure') || t.includes('redressement') || t.includes('liquidation')) {
    return 'procedure_collective'
  }
  if (t.includes('radiation') || t.includes('clôture') || t.includes('cloture')) return 'radiation'
  if (t.includes('création') || t.includes('creation') || t.includes('immatriculation')) return 'creation'
  if (desc.includes('augmentation') || desc.includes('réduction de capital') || desc.includes('reduction de capital')) {
    return 'modif_capital'
  }
  if (t.includes('modification')) return 'modification'
  return 'autre'
}

/**
 * Produce a stable hash-free external_id from the structural identifiers a
 * Pappers acte exposes. Used by the UI to deduplicate across re-mining and
 * by debugging to trace a signal back to its source.
 */
function acteExternalId(depot: PappersActeDepot, acte: PappersActe, idx: number): string {
  const date = acte.date_acte ?? depot.date_depot ?? 'no-date'
  const type = (acte.type ?? 'acte').replace(/\s+/g, '-').toLowerCase()
  return `acte:${date}:${type}:${idx}`
}

function compteExternalId(c: PappersCompte): string {
  return `compte:${c.annee_cloture}:${c.type_comptes}`
}

function bodaccExternalId(p: PappersPublicationBodacc): string {
  if (p.numero_annonce && p.numero_parution) {
    return `bodacc:${p.bodacc ?? '?'}:${p.numero_parution}:${p.numero_annonce}`
  }
  return `bodacc:${p.date}:${(p.type ?? 'pub').toLowerCase()}`
}

/**
 * Best-effort ISO timestamp resolution. Falls back to "now" if all date
 * fields are missing — we still want the signal in the timeline (the user
 * sees "date unknown" via the UI) rather than dropping it on the floor.
 */
function toIso(date: string | null | undefined, fallback: string): string {
  if (!date) return fallback
  // Pappers returns YYYY-MM-DD; normalize to a stable midnight UTC ISO.
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return `${date}T00:00:00.000Z`
  // Some BODACC fields are already full ISO — keep as-is if parseable.
  const t = new Date(date).getTime()
  if (!Number.isNaN(t)) return new Date(t).toISOString()
  return fallback
}

/**
 * Main entry point. Maps a `PappersPremiumData` payload into the flat list
 * of signal inserts ready to upsert into `prospection_signals`.
 *
 * Caller is responsible for attaching `prospect_id` + `org_id` and for
 * issuing the INSERT … ON CONFLICT DO NOTHING (the unique index is already
 * in place since migration 20260516010000).
 */
export function minePremiumSignals(premium: PappersPremiumData): PremiumSignalInsert[] {
  const now = new Date().toISOString()
  const out: PremiumSignalInsert[] = []

  // 1) Actes juridiques — each depot contains 1..N actes. We emit one signal
  //    per acte to keep semantic granularity (a depot can mix "cession" and
  //    "augmentation de capital" in the same filing).
  for (const depot of premium.depots_actes ?? []) {
    const actes = Array.isArray(depot.actes) ? depot.actes : []
    if (actes.length === 0) {
      // Some depots arrive without itemized actes — still useful as a "filing
      // happened" signal so we don't lose the event entirely.
      out.push({
        type: 'modification',
        source: 'pappers',
        detected_at: toIso(depot.date_depot, now),
        data: {
          libelle: depot.nom_fichier_pdf ?? 'Dépôt d’acte',
          external_id: `acte:${depot.date_depot ?? 'no-date'}:depot-empty`,
          premium_kind: 'actes',
          raw: { date_depot: depot.date_depot, disponible: depot.disponible },
        },
      })
      continue
    }
    actes.forEach((acte, idx) => {
      const type = classifyActe(acte)
      const dateRaw = acte.date_acte ?? depot.date_depot
      out.push({
        type,
        source: 'pappers',
        detected_at: toIso(dateRaw, now),
        data: {
          libelle: acte.type ?? acte.decision ?? 'Acte juridique',
          external_id: acteExternalId(depot, acte, idx),
          premium_kind: 'actes',
          raw: {
            acte_type: acte.type,
            decision: acte.decision,
            date_acte: acte.date_acte,
            depot_date: depot.date_depot,
            disponible: depot.disponible,
          },
        },
      })
    })
  }

  // 2) Comptes annuels — one signal per dépôt. Useful patrimoine timeline
  //    marker (revenue/marge year-over-year visibility = capital event clue).
  for (const c of premium.comptes ?? []) {
    out.push({
      type: 'depot_comptes',
      source: 'pappers',
      detected_at: toIso(c.date_depot ?? `${c.annee_cloture}-12-31`, now),
      data: {
        libelle: `Comptes ${c.annee_cloture}${c.type_comptes ? ` (${c.type_comptes})` : ''}`,
        external_id: compteExternalId(c),
        premium_kind: 'comptes',
        raw: {
          annee_cloture: c.annee_cloture,
          date_cloture: c.date_cloture,
          type_comptes: c.type_comptes,
          confidentialite: c.confidentialite,
          disponible: c.disponible,
        },
      },
    })
  }

  // 3) Publications BODACC enrichies — note : la cron BODACC ingest peuple
  //    déjà `prospection_signals_inbox` avec les annonces brutes du jour. Ici
  //    on extrait les annonces historiques (>1y) que la cron n'a pas vues, ET
  //    avec la classification fine que Pappers expose dans le payload (rcs,
  //    greffe, capital, denomination). On garde le préfixe `bodacc:` dans
  //    l'external_id pour éviter une collision avec les inserts cron.
  for (const pub of premium.publications_bodacc ?? []) {
    if (!pub.date) continue
    const type = classifyBodaccPublication(pub)
    out.push({
      type,
      source: 'pappers',
      detected_at: toIso(pub.date, now),
      data: {
        libelle: pub.type ?? pub.description ?? 'Publication BODACC',
        external_id: bodaccExternalId(pub),
        premium_kind: 'bodacc',
        raw: {
          bodacc: pub.bodacc,
          rcs: pub.rcs,
          greffe: pub.greffe,
          capital: pub.capital,
          denomination: pub.denomination,
          activite: pub.activite,
          description: pub.description,
        },
      },
    })
  }

  return out
}
