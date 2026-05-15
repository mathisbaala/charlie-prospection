import { getBodaccBySiren, classifyBodaccEvent } from '@/lib/data-sources/bodacc'
import { getDvfByCommune } from '@/lib/data-sources/dvf'
import {
  getPappersEnrichment,
  getPersonneEntreprises,
} from '@/lib/data-sources/pappers'
import { searchRpps, pickBestRppsMatch } from '@/lib/data-sources/rpps'
import { buildDoctolibSearchUrl } from '@/lib/data-sources/doctolib'
import { computeFinanceDerivatives } from '@/lib/enrichment/finance-derivatives'
import { analyzePersonalPortfolio } from '@/lib/enrichment/personal-portfolio'
import type {
  BodaccEvent,
  ContexteMarcheImmoLocal,
  DvfTransaction,
  FinanceYear,
  PotentielRppsNiveau,
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

/**
 * Derive a coarse patrimonial potential from RPPS fields.
 * Used as a hard input to the patrimony scorer — a chirurgien secteur 2
 * has ~5–10x the revenue of a généraliste secteur 1, so the scorer needs
 * this signal explicitly rather than guessing from `libelleProfession`.
 */
export function computePotentielRpps(rpps: RppsData | undefined): PotentielRppsNiveau | undefined {
  if (!rpps) return undefined
  const mode = (rpps.mode_exercice ?? '').toLowerCase()
  const secteur = (rpps.type_activite_liberale ?? '').toLowerCase()
  const savoir = (rpps.savoir_faire ?? rpps.profession ?? '').toLowerCase()

  if (mode.includes('salar')) return 'faible'

  const isLiberal = mode.includes('libér') || mode.includes('liber')
  if (!isLiberal) return 'moyen' // mode inconnu/mixte → milieu

  const isSecteur23 = secteur.includes('secteur 2') || secteur.includes('secteur 3')
  const isHautPlateauTechnique =
    savoir.includes('chirurg') ||
    savoir.includes('radio') ||
    savoir.includes('imagerie') ||
    savoir.includes('anesth') ||
    savoir.includes('cardio') ||
    savoir.includes('ophtalm') ||
    savoir.includes('stomato')

  if (isSecteur23 && isHautPlateauTechnique) return 'tres_fort'

  const isTechniqueSecteur1 =
    savoir.includes('gastro') ||
    savoir.includes('pneumo') ||
    savoir.includes('rhumato') ||
    savoir.includes('néphro') ||
    savoir.includes('nephro') ||
    savoir.includes('neuro') ||
    savoir.includes('dermato') ||
    savoir.includes('psychiatr') ||
    savoir.includes('endocrin') ||
    isHautPlateauTechnique // technique en secteur 1 — toujours technique

  const isGeneraliste = savoir.includes('général') || savoir.includes('generaliste') || savoir.includes('medecine generale')

  if (isTechniqueSecteur1) return 'fort'
  if (isGeneraliste) return 'moyen'
  return 'moyen'
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

  // Call all enrichment sources in parallel. Personal portfolio (SCI /
  // holdings / autres sociétés du dirigeant) est résolu en parallèle des
  // autres sources : c'est UN appel Pappers de plus par prospect, mais le
  // signal patrimonial qu'il révèle (multi-entités patrimoniales) est
  // central pour un CGP qui démarche des personnes — pas des sociétés.
  const [bodaccResult, pappersResult, rppsResult, codeCommune, personnePappersResult] =
    await Promise.allSettled([
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
      raw.dirigeant_prenom && raw.dirigeant_nom
        ? getPersonneEntreprises(raw.dirigeant_prenom, raw.dirigeant_nom)
        : Promise.resolve(null),
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
      // Calcule les dérivées (croissance, marge trend, D/E, etc.) — pure,
      // utilisé par le scorer patrimoine pour distinguer "5M€ en croissance"
      // vs "5M€ en déclin".
      enrichment.finance_derivatives = computeFinanceDerivatives(enrichment.finances)
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

  // ── Portefeuille patrimonial du dirigeant ──────────────
  // Détecte les SCI, holdings, autres sociétés rattachées à la personne.
  // Indicateur direct de patrimoine structuré (vs. un dirigeant unique
  // qui n'a que son entreprise principale).
  if (
    personnePappersResult.status === 'fulfilled' &&
    personnePappersResult.value &&
    raw.siren
  ) {
    const portfolio = analyzePersonalPortfolio(
      personnePappersResult.value.entreprises,
      raw.siren,
    )
    if (portfolio.total_entites > 0) {
      enrichment.personal_portfolio = portfolio
      // Ne pas dupliquer 'pappers_finances' déjà ajouté — on track sous un
      // tag distinct pour observabilité.
      if (!enrichment.sources_utilisees?.includes('pappers_dirigeant')) {
        enrichment.sources_utilisees?.push('pappers_dirigeant')
      }
    }
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
      enrichment.potentiel_rpps = computePotentielRpps(enrichment.rpps)
      enrichment.sources_utilisees?.push('rpps')
    }
  }

  // ── DVF — contexte marché immobilier local (PAS patrimoine perso) ───────
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
        // Indicateur de zone, jamais le patrimoine du dirigeant
        enrichment.contexte_marche_immo_local = {
          mediane_zone: median,
          nb_transactions_zone: dvfRecords.length,
          ville: dvfRecords[0]?.nom_commune ?? raw.ville,
        } satisfies ContexteMarcheImmoLocal
        enrichment.sources_utilisees?.push('dvf')
      }
    } catch {
      // DVF unavailable, skip
    }
  }

  return enrichment
}
