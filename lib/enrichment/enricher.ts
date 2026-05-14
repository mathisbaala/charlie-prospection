import { getBodaccBySiren, classifyBodaccEvent } from '@/lib/data-sources/bodacc'
import { getDvfByCommune } from '@/lib/data-sources/dvf'
import type { BodaccEvent, DvfTransaction, ProspectEnrichmentData } from '@/lib/types'
import type { RawProspect } from '@/lib/prospect-search/engine'

async function resolveCodeCommune(codePostal: string, ville: string): Promise<string> {
  if (!codePostal) return ''
  if (codePostal.startsWith('75')) return '75056'
  if (codePostal.startsWith('69') && ville.toLowerCase().includes('lyon')) return '69123'
  if (codePostal.startsWith('13') && ville.toLowerCase().includes('marseille')) return '13055'
  try {
    const res = await fetch(
      `https://geo.api.gouv.fr/communes?codePostal=${codePostal}&fields=code,nom&limit=5`,
      { next: { revalidate: 86400 } }
    )
    if (!res.ok) return ''
    const communes: Array<{ code: string; nom: string }> = await res.json()
    if (!communes.length) return ''
    const villeLower = ville.toLowerCase()
    const match = communes.find(
      c => c.nom.toLowerCase().includes(villeLower) || villeLower.includes(c.nom.toLowerCase())
    )
    return match?.code ?? communes[0].code
  } catch {
    return ''
  }
}

export async function enrichProspect(raw: RawProspect): Promise<ProspectEnrichmentData> {
  const enrichment: ProspectEnrichmentData = {
    dirigeant_nom: raw.dirigeant_nom,
    dirigeant_prenom: raw.dirigeant_prenom,
    dirigeant_qualite: raw.dirigeant_qualite,
    dirigeant_annee_naissance: raw.dirigeant_annee_naissance,
    siren: raw.siren,
    forme_juridique: raw.dirigeant_qualite,
    date_creation_entreprise: raw.date_creation,
    code_naf: raw.code_naf,
    libelle_naf: raw.libelle_naf,
    tranche_effectifs: raw.tranche_effectifs,
    adresse_entreprise: raw.adresse,
    code_postal: raw.code_postal,
    ville: raw.ville,
    departement: raw.departement,
    linkedin_search_url: raw.linkedin_search_url,
    sources_utilisees: ['annuaire_entreprises'],
    enrichi_le: new Date().toISOString(),
  }

  // Enrichissement BODACC
  if (raw.siren) {
    try {
      const bodaccRecords = await getBodaccBySiren(raw.siren, 10)
      if (bodaccRecords.length > 0) {
        enrichment.bodacc_events = bodaccRecords.map((r): BodaccEvent => ({
          id: r.id,
          date: r.dateparution,
          type: classifyBodaccEvent(r),
          libelle: r.typeavis_lib ?? r.familleavis_lib ?? 'Annonce légale',
          source: 'bodacc',
        }))
        enrichment.sources_utilisees?.push('bodacc')
      }
    } catch {
      // BODACC unavailable, skip
    }
  }

  // Enrichissement DVF
  if (raw.code_postal) {
    try {
      const codeCommune = await resolveCodeCommune(raw.code_postal, raw.ville)
      if (codeCommune) {
        const dvfRecords = await getDvfByCommune(codeCommune, 300_000, 10)
        if (dvfRecords.length > 0) {
          enrichment.dvf_transactions = dvfRecords.map((r): DvfTransaction => ({
            id: r.id_mutation,
            date_mutation: r.date_mutation,
            nature_mutation: r.nature_mutation,
            valeur_fonciere: r.valeur_fonciere,
            type_local: r.type_local ?? 'bien',
            surface_reelle_bati: r.surface_reelle_bati,
            adresse: `${r.adresse_numero ?? ''} ${r.adresse_voie ?? ''}`.trim(),
            commune: r.nom_commune,
          }))
          const values = dvfRecords.map(r => r.valeur_fonciere).sort((a, b) => a - b)
          const median = values[Math.floor(values.length / 2)] ?? 0
          enrichment.patrimoine_immo_estime = median
          enrichment.sources_utilisees?.push('dvf')
        }
      }
    } catch {
      // DVF unavailable, skip
    }
  }

  return enrichment
}
