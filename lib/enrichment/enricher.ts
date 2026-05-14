import { getBodaccBySiren, classifyBodaccEvent } from '@/lib/data-sources/bodacc'
import { getDvfByCommune } from '@/lib/data-sources/dvf'
import { getPappersEnrichment } from '@/lib/data-sources/pappers'
import { searchRpps, pickBestRppsMatch } from '@/lib/data-sources/rpps'
import { buildDoctolibSearchUrl } from '@/lib/data-sources/doctolib'
import type {
  BodaccEvent,
  DvfTransaction,
  FinanceYear,
  ProspectEnrichmentData,
  RppsData,
} from '@/lib/types'
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

// NAF codes for health professions — triggers RPPS enrichment
function isHealthProfessional(codeNaf: string): boolean {
  if (!codeNaf) return false
  return (
    codeNaf.startsWith('86.') ||
    codeNaf.startsWith('86') ||
    codeNaf.startsWith('87.') ||
    codeNaf.startsWith('75.00') // vétérinaires
  )
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
    sources_utilisees: [raw.source === 'pappers' ? 'pappers' : 'annuaire_entreprises'],
    enrichi_le: new Date().toISOString(),
  }

  // Resolve commune code once (used by DVF)
  const codeCommunePromise = raw.code_postal
    ? resolveCodeCommune(raw.code_postal, raw.ville)
    : Promise.resolve('')

  // Call all enrichment sources in parallel
  const [bodaccResult, pappersResult, rppsResult, codeCommune] = await Promise.allSettled([
    raw.siren ? getBodaccBySiren(raw.siren, 10) : Promise.resolve([]),
    raw.siren ? getPappersEnrichment(raw.siren) : Promise.resolve(null),
    isHealthProfessional(raw.code_naf) && raw.dirigeant_nom
      ? searchRpps({
          nom: raw.dirigeant_nom,
          prenom: raw.dirigeant_prenom,
          departement: raw.departement,
          limit: 5,
        })
      : Promise.resolve([]),
    codeCommunePromise,
  ])

  // ── BODACC ─────────────────────────────────────────────
  if (bodaccResult.status === 'fulfilled' && bodaccResult.value.length > 0) {
    enrichment.bodacc_events = bodaccResult.value.map((r): BodaccEvent => ({
      id: r.id,
      date: r.dateparution,
      type: classifyBodaccEvent(r),
      libelle: r.typeavis_lib ?? r.familleavis_lib ?? 'Annonce légale',
      source: 'bodacc',
    }))
    enrichment.sources_utilisees?.push('bodacc')
  }

  // ── Pappers finances + gouvernance ─────────────────────
  if (pappersResult.status === 'fulfilled' && pappersResult.value) {
    const p = pappersResult.value
    if (p.finances.length > 0) {
      enrichment.finances = p.finances.slice(0, 5).map((f): FinanceYear => ({
        annee: f.annee,
        chiffre_affaires: f.chiffre_affaires,
        resultat: f.resultat,
        marge_brute: f.marge_brute,
        excedent_brut_exploitation: f.excedent_brut_exploitation,
        taux_marge_EBITDA: f.taux_marge_EBITDA,
        taux_croissance_chiffre_affaires: f.taux_croissance_chiffre_affaires,
        fonds_propres: f.fonds_propres,
        rentabilite_fonds_propres: f.rentabilite_fonds_propres,
        dettes_financieres: f.dettes_financieres,
        capacite_autofinancement: f.capacite_autofinancement,
        effectif: f.effectif,
      }))
      const last = enrichment.finances[0]
      enrichment.chiffre_affaires_dernier = last.chiffre_affaires
      enrichment.resultat_dernier = last.resultat
      enrichment.taux_marge_dernier = last.taux_marge_EBITDA
      enrichment.fonds_propres_dernier = last.fonds_propres
    }
    if (p.beneficiaires_effectifs.length > 0) {
      enrichment.beneficiaires_effectifs = p.beneficiaires_effectifs.map(b => ({
        nom: b.nom,
        prenom: b.prenom,
        pourcentage_parts: b.pourcentage_parts,
        pourcentage_votes: b.pourcentage_votes,
        nationalite: b.nationalite,
        date_de_naissance: b.date_de_naissance,
      }))
    }
    enrichment.procedure_collective_en_cours = p.procedure_collective_en_cours
    enrichment.capital_social = p.capital
    enrichment.date_immatriculation_rcs = p.date_immatriculation_rcs
    enrichment.greffe = p.greffe
    enrichment.numero_tva = p.numero_tva_intracommunautaire
    enrichment.nb_etablissements = p.nb_etablissements
    enrichment.sources_utilisees?.push('pappers_finances')
  }

  // ── RPPS (professionnels de santé) ─────────────────────
  if (
    rppsResult.status === 'fulfilled' &&
    rppsResult.value.length > 0 &&
    raw.dirigeant_nom &&
    raw.dirigeant_prenom
  ) {
    const match = pickBestRppsMatch(rppsResult.value, raw.dirigeant_nom, raw.dirigeant_prenom)
    if (match) {
      const ea = match.exerciceActivite?.[0]
      const se = match.situationExercice?.[0]
      const profession = ea?.libelleProfession ?? match.libelleProfession
      const cabinetCommune = se?.libelleCommune
      enrichment.rpps = {
        identifiant: match.identifiant,
        profession,
        categorie_professionnelle: match.libelleCategorieProfessionnelle,
        mode_exercice: ea?.libelleMode,
        type_activite_liberale: ea?.libelleTypeActiviteLiberale,
        savoir_faire: ea?.libelleSavoirFaire ?? se?.libelleSavoirFaire,
        cabinet_nom: se?.raisonSociale,
        cabinet_commune: cabinetCommune,
        cabinet_code_postal: se?.codePostal,
        cabinet_adresse: se?.adresseLigne1,
        doctolib_search_url: buildDoctolibSearchUrl({
          nom: raw.dirigeant_nom,
          prenom: raw.dirigeant_prenom,
          commune: cabinetCommune ?? raw.ville,
          profession,
        }),
      } satisfies RppsData
      enrichment.sources_utilisees?.push('rpps')
    }
  }

  // ── DVF (transactions immobilières) ────────────────────
  if (codeCommune.status === 'fulfilled' && codeCommune.value) {
    try {
      const dvfRecords = await getDvfByCommune(codeCommune.value, 300_000, 10)
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
    } catch {
      // DVF unavailable, skip
    }
  }

  return enrichment
}
