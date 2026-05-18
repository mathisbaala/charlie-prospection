// BALO — Bulletin des Annonces Légales Obligatoires
//
// ⚠️  NON FONCTIONNEL — deux blocages non résolus (2026-05-18) :
//
// 1. fond: "BALO" n'est pas un fond valide pour l'endpoint Legifrance
//    /dila/legifrance/lf-engine-app/search → renvoie systématiquement HTTP 400.
//    BALO est hébergé séparément sur OpenDataSoft (journal-officiel-datadila
//    .opendatasoft.com) et non dans Legifrance.
//
// 2. L'API OpenDataSoft BALO bloque toutes les requêtes serveur (403).
//    Elle offre le champ code_siren qui permettrait une recherche propre par
//    SIREN, mais nécessite soit un API key DILA dédié, soit un accès navigateur.
//
// Pourquoi c'est dépriorisé :
//   BALO est obligatoire uniquement pour les sociétés cotées et les SA/SAS avec
//   >100 actionnaires. Nos cibles (SELARL médicales, SCP notariales, SEL
//   dentaires) ont en général 1 à 10 associés — elles ne publient pas au BALO.
//   Pour les dividendes des PME libérales, la bonne source est la liasse fiscale
//   (Pappers Premium, poste 4100), qui couvre l'intégralité de nos cibles.
//
// Pour réactiver :
//   Obtenir un API key DILA sur le portail OpenDataSoft et implémenter
//   GET https://journal-officiel-datadila.opendatasoft.com/api/explore/v2.1/
//       catalog/datasets/balo/records?where=code_siren="<SIREN>"&order_by=
//       date_publication%20DESC
//   Le champ sous_categorie="Dividendes" permet de filtrer les distributions.

export interface DividendeBalo {
  date_publication: string
  entreprise: string
  montant_par_action?: number
  date_mise_en_paiement?: string
  resume?: string
}

// Retourne toujours [] — non fonctionnel, voir raisons ci-dessus.
// Le pipeline suivi/add et refresh-enrichment ignorent silencieusement les tableaux vides.
export async function getDividendesBalo(
  _nom: string,
  _entrepriseNom?: string,
): Promise<DividendeBalo[]> {
  return []
}
