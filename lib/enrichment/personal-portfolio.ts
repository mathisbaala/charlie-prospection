import type { PappersPersonne } from '@/lib/data-sources/pappers'

/**
 * Analyse du portefeuille d'entités juridiques d'une personne physique.
 *
 * Pourquoi : un CGP démarche des humains, pas des sociétés. Le signal le
 * plus fort pour un CGP est de savoir qu'un dirigeant détient une
 * structure patrimoniale complexe (SCI, holding, plusieurs sociétés) —
 * c'est l'indicateur direct d'un patrimoine structuré et significatif.
 *
 * Source : Pappers `/recherche-dirigeants` retourne TOUTES les entreprises
 * où une personne apparaît comme dirigeante (sans appel supplémentaire).
 * Cette analyse est donc gratuite côté Pappers — pure exploitation des
 * données déjà retournées.
 *
 * Note volontaire : nous ne pouvons PAS accéder au cadastre nominal
 * (secret fiscal). L'inventaire des biens immobiliers personnels d'une
 * personne par son nom n'est pas en open data. Le "portefeuille
 * d'entités" est notre meilleur proxy — il révèle où la personne a
 * structuré son patrimoine, sans le coût d'un abonnement DGFiP.
 */

export type EntityCategory =
  | 'sci' // Société civile immobilière — patrimoine immo structuré
  | 'sccv' // SCCV / SCI de construction-vente
  | 'holding' // Holding personnelle ou patrimoniale
  | 'principale' // L'entité d'origine du prospect (passée en input)
  | 'societe_active' // SARL/SAS/SA active autre que la principale
  | 'autre' // Forme rare ou inclassée (asso, GIE, etc.)

export interface EntitySummary {
  siren: string
  nom_entreprise: string
  code_naf?: string
  libelle_code_naf?: string
  date_creation?: string
  ville?: string
  category: EntityCategory
}

export interface PersonalPortfolio {
  /** Total entreprises rattachées à la personne (incl. principale). */
  total_entites: number
  /** Nombre de SCI / SCCV (immobilier structuré). */
  nb_sci: number
  /** Nombre de holdings. */
  nb_holding: number
  /** Nombre de sociétés actives autres que la principale. */
  nb_societes_actives: number
  /** Détail (ordonné : principale > holdings > SCI > actives > autre). */
  entites: EntitySummary[]
  /**
   * Indicateur composite "patrimoine multi-entités" :
   *   none      → 1 seule entité (la principale)
   *   simple    → 2-3 entités sans SCI/holding (juste plusieurs business)
   *   structuré → SCI ou holding présente
   *   sophistiqué → SCI + holding + ≥1 société active (montage avancé)
   */
  niveau_structuration: 'none' | 'simple' | 'structuré' | 'sophistiqué'
}

const EMPTY_PORTFOLIO: PersonalPortfolio = {
  total_entites: 0,
  nb_sci: 0,
  nb_holding: 0,
  nb_societes_actives: 0,
  entites: [],
  niveau_structuration: 'none',
}

/** Détecte la catégorie d'une entité à partir de son nom, NAF, libellé NAF.
 *
 *  Volontairement défensif : on accepte des inputs partiels (Pappers
 *  recherche-dirigeants ne donne pas la forme juridique). Heuristiques :
 *  - NAF 68.2 / 68.3 → SCI (activités immobilières)
 *  - NAF 64.20Z → holding (activités des sociétés holding)
 *  - libellé NAF contient "société civile immobilière" → SCI
 *  - nom_entreprise commence par "SCI " / "SCCV " → SCI/SCCV
 *  - nom_entreprise commence par "HOLDING " ou contient " HOLDING" → holding
 */
export function categorizeEntity(input: {
  siren: string
  nom_entreprise?: string
  code_naf?: string
  libelle_code_naf?: string
  isPrincipale?: boolean
}): EntityCategory {
  if (input.isPrincipale) return 'principale'

  const naf = (input.code_naf ?? '').replace(/\./g, '').toUpperCase()
  const nafLibelle = (input.libelle_code_naf ?? '').toLowerCase()
  const nom = (input.nom_entreprise ?? '').toUpperCase().trim()

  // SCCV (très distinct) — vérifié avant SCI
  if (/^SCCV[\s,.-]/.test(nom) || nafLibelle.includes('construction-vente')) {
    return 'sccv'
  }

  // SCI — par NAF immobilier ou par préfixe nom
  if (naf.startsWith('682') || naf.startsWith('683')) return 'sci'
  if (/^SCI[\s,.-]/.test(nom)) return 'sci'
  if (nafLibelle.includes('société civile immobilière')) return 'sci'

  // Holding — NAF 6420Z (activités des sièges sociaux) ou mention dans le nom
  if (naf === '6420Z' || naf === '64200') return 'holding'
  if (
    /(^|\s|-)HOLDING(\s|-|$)/.test(nom) ||
    /(^|\s|-)PATRIMOINE(\s|-|$)/.test(nom) ||
    /(^|\s|-)PARTICIPATIONS(\s|-|$)/.test(nom)
  ) {
    return 'holding'
  }

  // Société active opérationnelle (par défaut quand on a un NAF "réel")
  if (naf && naf !== 'AUTRE') return 'societe_active'

  return 'autre'
}

/** Classement custom : principale d'abord, puis structures patrimoniales,
 *  puis sociétés actives, puis autre. Au sein d'une catégorie : date_creation
 *  desc (plus récente d'abord). */
const CATEGORY_ORDER: Record<EntityCategory, number> = {
  principale: 0,
  holding: 1,
  sci: 2,
  sccv: 3,
  societe_active: 4,
  autre: 5,
}

function sortEntites(entites: EntitySummary[]): EntitySummary[] {
  return [...entites].sort((a, b) => {
    const ord = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]
    if (ord !== 0) return ord
    // Within same category, fresher first
    const da = a.date_creation ?? ''
    const db = b.date_creation ?? ''
    if (da !== db) return db.localeCompare(da)
    return a.nom_entreprise.localeCompare(b.nom_entreprise)
  })
}

/** Niveau de structuration patrimoniale en fonction des catégories trouvées. */
function classifyStructuration(
  nb_sci: number,
  nb_holding: number,
  nb_societes_actives: number,
  total: number,
): PersonalPortfolio['niveau_structuration'] {
  if (total <= 1) return 'none'
  const hasPatrimonialEntity = nb_sci > 0 || nb_holding > 0
  if (nb_sci > 0 && nb_holding > 0 && nb_societes_actives >= 1) return 'sophistiqué'
  if (hasPatrimonialEntity) return 'structuré'
  return 'simple'
}

/**
 * Analyse complète du portefeuille d'entités.
 *
 * @param entreprises Liste retournée par Pappers searchPersonnes — l'array
 *   entreprises de la PappersPersonne match. Doit inclure l'entité
 *   principale aussi.
 * @param mainSiren Le SIREN de l'entité par laquelle on a trouvé le prospect
 *   (= la "principale", ne sera pas comptée comme structure annexe).
 */
export function analyzePersonalPortfolio(
  entreprises: NonNullable<PappersPersonne['entreprises']> | undefined,
  mainSiren: string,
): PersonalPortfolio {
  if (!entreprises || entreprises.length === 0) return EMPTY_PORTFOLIO

  // Dedupe par SIREN (rare mais possible si Pappers double-liste)
  const bySiren = new Map<string, NonNullable<PappersPersonne['entreprises']>[number]>()
  for (const e of entreprises) {
    if (!e.siren) continue
    if (!bySiren.has(e.siren)) bySiren.set(e.siren, e)
  }

  const entites: EntitySummary[] = []
  for (const e of bySiren.values()) {
    const isPrincipale = e.siren === mainSiren
    const category = categorizeEntity({
      siren: e.siren,
      nom_entreprise: e.nom_entreprise,
      code_naf: e.code_naf,
      libelle_code_naf: e.libelle_code_naf,
      isPrincipale,
    })
    entites.push({
      siren: e.siren,
      nom_entreprise: e.nom_entreprise ?? '—',
      code_naf: e.code_naf,
      libelle_code_naf: e.libelle_code_naf,
      date_creation: e.date_creation,
      ville: e.siege?.ville,
      category,
    })
  }

  const sorted = sortEntites(entites)

  let nb_sci = 0
  let nb_holding = 0
  let nb_societes_actives = 0
  for (const e of sorted) {
    if (e.category === 'sci' || e.category === 'sccv') nb_sci += 1
    else if (e.category === 'holding') nb_holding += 1
    else if (e.category === 'societe_active') nb_societes_actives += 1
  }

  return {
    total_entites: sorted.length,
    nb_sci,
    nb_holding,
    nb_societes_actives,
    entites: sorted,
    niveau_structuration: classifyStructuration(
      nb_sci,
      nb_holding,
      nb_societes_actives,
      sorted.length,
    ),
  }
}

/**
 * Phrase compacte en français pour injection dans le prompt patrimony-scorer.
 * Reste null-safe : retourne une string informative même si pas de données.
 */
export function summarizePortfolio(p: PersonalPortfolio): string {
  if (p.total_entites <= 1) {
    return 'Une seule entité juridique connue (la principale) — pas de patrimoine multi-entités détecté.'
  }
  const parts: string[] = []
  parts.push(`${p.total_entites} entités juridiques au total`)
  if (p.nb_sci > 0) parts.push(`${p.nb_sci} SCI/SCCV`)
  if (p.nb_holding > 0) parts.push(`${p.nb_holding} holding${p.nb_holding > 1 ? 's' : ''}`)
  if (p.nb_societes_actives > 0)
    parts.push(`${p.nb_societes_actives} société${p.nb_societes_actives > 1 ? 's' : ''} active${p.nb_societes_actives > 1 ? 's' : ''} annexe${p.nb_societes_actives > 1 ? 's' : ''}`)
  parts.push(`niveau structuration: **${p.niveau_structuration}**`)
  return parts.join(' · ')
}
