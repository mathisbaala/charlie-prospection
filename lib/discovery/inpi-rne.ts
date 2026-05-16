import { fetchInpiDailyDiff } from '@/lib/data-sources/inpi'
import {
  getEntrepriseBySiren,
  type AEResult,
  type AEDirigeant,
} from '@/lib/data-sources/annuaire-entreprises'
import { canonicalPersonKey, deptFromCodePostal } from '@/lib/prospect-search/engine'
import type { DiscoverySource, DiscoveryParams } from './types'
import type { RawProspect } from '@/lib/prospect-search/engine'

// INPI RNE daily diff — surfaces companies with recent patrimonial moves
// (capital changes, beneficial-owner restructuring, new acts filed).
// Requires: INPI_API_TOKEN + INPI_API_BASE env vars (see lib/data-sources/inpi.ts).
// Degrades gracefully to [] when token is absent.

const DEFAULT_LIMIT = 20

// Events signalling active wealth restructuring — high signal for CGP
const SIGNAL_EVENTS = [
  'MODIFICATION_CAPITAL',
  'MODIFICATION_BENEFICIAIRE',
  'DEPOT_ACTES',
  'CREATION',
  'IMMATRICULATION',
]

function buildLinkedInUrl(prenom: string, nom: string, entreprise: string): string {
  const q = encodeURIComponent(`${prenom} ${nom} ${entreprise}`)
  return `https://www.linkedin.com/search/results/people/?keywords=${q}`
}

function firstPhysicalDirigeant(ae: AEResult): AEDirigeant | null {
  for (const d of ae.dirigeants ?? []) {
    if (!d.nom) continue
    const upper = d.nom.toUpperCase()
    if (upper.includes('SARL') || upper.includes('SAS') || upper.includes('SCI')) continue
    return d
  }
  return null
}

function toRawProspect(ae: AEResult, d: AEDirigeant, dept: string): RawProspect {
  const prenom = d.prenoms?.split(/[\s,]+/)[0]?.trim() ?? ''
  const nom = d.nom?.trim() ?? ''
  return {
    uid: canonicalPersonKey(prenom, nom, ae.siren),
    source: 'inpi_rne',
    source_type: 'personne_morale',
    entreprise_nom: ae.nom_complet,
    siren: ae.siren,
    code_naf: ae.activite_principale ?? '',
    libelle_naf: ae.libelle_activite_principale ?? '',
    date_creation: ae.date_creation ?? '',
    tranche_effectifs: ae.tranche_effectif_salarie ?? '',
    adresse: ae.siege.adresse ?? '',
    code_postal: ae.siege.code_postal ?? '',
    ville: ae.siege.libelle_commune ?? ae.siege.commune ?? '',
    departement: dept,
    dirigeant_nom: nom,
    dirigeant_prenom: prenom,
    dirigeant_qualite: d.qualite,
    linkedin_search_url: buildLinkedInUrl(prenom, nom, ae.nom_complet),
    score_initial: 30, // événement patrimonial INPI détecté — signal actif
  }
}

export const inpiRneSource: DiscoverySource = {
  name: 'inpi-rne',

  async discover(params: DiscoveryParams): Promise<RawProspect[]> {
    const token = process.env.INPI_API_TOKEN
    const baseUrl = process.env.INPI_API_BASE
    if (!token || !baseUrl) return []

    const limit = params.limit ?? DEFAULT_LIMIT
    const dateSince =
      params.date_depuis ??
      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    let formalites
    try {
      formalites = await fetchInpiDailyDiff({
        sinceDate: dateSince,
        baseUrl,
        token,
        maxRecords: limit * 6,
      })
    } catch {
      return []
    }

    // Keep only patrimonial-signal events with a resolvable SIREN
    const signalEvents = formalites.filter((f) => {
      if (!f.siren) return false
      const type = (f.typeEvenement ?? '').toUpperCase()
      return SIGNAL_EVENTS.some((s) => type.includes(s))
    })

    const seen = new Set<string>()
    const results: RawProspect[] = []

    const settled = await Promise.allSettled(
      signalEvents.slice(0, limit * 4).map(async (f) => {
        if (!f.siren) return null
        const ae = await getEntrepriseBySiren(f.siren)
        if (!ae) return null

        const dept = ae.siege.departement ?? deptFromCodePostal(ae.siege.code_postal)
        if (params.departement && dept !== params.departement) return null

        const d = firstPhysicalDirigeant(ae)
        if (!d || !d.nom) return null

        return toRawProspect(ae, d, dept)
      }),
    )

    for (const r of settled) {
      if (results.length >= limit) break
      if (r.status === 'rejected' || !r.value) continue
      if (seen.has(r.value.uid)) continue
      seen.add(r.value.uid)
      results.push(r.value)
    }

    return results
  },
}
