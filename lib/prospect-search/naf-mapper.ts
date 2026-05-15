// Mapping ICP roles → codes NAF et mots-clés de recherche
//
// Codes NAF rév. 2 (INSEE 2008). Les codes ont la forme "XX.XXA"
// (5 caractères avec point). Les sources Pappers/AE acceptent les deux
// formats (avec/sans point) ; on conserve le format canonique avec point.
//
// Référence : https://www.insee.fr/fr/information/2406147

export const NAF_MAP: Record<string, { codes: string[]; keywords: string[] }> = {
  // ── Santé ───────────────────────────────────────────────────────
  'médecin généraliste': { codes: ['86.21Z'], keywords: ['médecin général'] },
  'médecin spécialiste': { codes: ['86.22A', '86.22B', '86.22C', '86.22D'], keywords: ['médecin spécialiste'] },
  'chirurgien': { codes: ['86.22A'], keywords: ['chirurgien'] },
  'dentiste': { codes: ['86.23Z'], keywords: ['dentiste', 'chirurgien-dentiste'] },
  'pharmacien': { codes: ['47.73Z'], keywords: ['pharmacie', 'pharmacien'] },
  'kinésithérapeute': { codes: ['86.90A'], keywords: ['kiné', 'kinésithérapeute'] },
  'infirmier': { codes: ['86.90C'], keywords: ['infirmier', 'cabinet infirmier'] },
  'sage-femme': { codes: ['86.90D'], keywords: ['sage-femme'] },
  'orthophoniste': { codes: ['86.90E'], keywords: ['orthophoniste'] },
  'orthoptiste': { codes: ['86.90F'], keywords: ['orthoptiste'] },
  'ostéopathe': { codes: ['86.90F'], keywords: ['ostéopathe'] },
  'psychologue': { codes: ['86.90F'], keywords: ['psychologue', 'thérapeute'] },
  'psychiatre': { codes: ['86.22C'], keywords: ['psychiatre'] },
  'vétérinaire': { codes: ['75.00Z'], keywords: ['vétérinaire'] },

  // ── Professions libérales (juridique / chiffre / cadre bâti) ────
  'avocat': { codes: ['69.10Z'], keywords: ['avocat', 'cabinet avocats'] },
  'expert comptable': { codes: ['69.20Z'], keywords: ['expert comptable', 'cabinet comptable'] },
  'commissaire aux comptes': { codes: ['69.20Z'], keywords: ['commissaire aux comptes', 'CAC'] },
  'notaire': { codes: ['69.10Z'], keywords: ['notaire', 'office notarial'] },
  'huissier': { codes: ['69.10Z'], keywords: ['huissier', 'commissaire de justice'] },
  'architecte': { codes: ['71.11Z'], keywords: ['architecte', 'cabinet architecture'] },
  'géomètre': { codes: ['71.12B'], keywords: ['géomètre', 'expert foncier'] },
  'ingénieur conseil': { codes: ['71.12B'], keywords: ['ingénieur conseil', 'bureau études'] },

  // ── Dirigeance générique / holdings ─────────────────────────────
  'dirigeant': { codes: ['70.10Z', '70.22Z', '64.20Z'], keywords: ['holding', 'direction générale'] },
  'entrepreneur': { codes: [], keywords: ['entrepreneur', 'fondateur', 'dirigeant'] },
  "chef d'entreprise": { codes: [], keywords: ['directeur général', 'PDG', 'président'] },
  'directeur': { codes: [], keywords: ['directeur', 'direction'] },
  'libéral': {
    codes: ['86.21Z', '86.22A', '86.23Z', '69.10Z', '69.20Z', '71.11Z'],
    keywords: ['libéral', 'cabinet'],
  },
  'professionnel de santé': {
    codes: ['86.21Z', '86.22A', '86.22B', '86.22C', '86.23Z', '86.90A', '86.90C', '86.90D', '86.90E', '86.90F'],
    keywords: ['santé', 'médical'],
  },

  // ── Artisans / commerce de proximité ───────────────────────────
  'boulanger': { codes: ['10.71B', '10.71C'], keywords: ['boulangerie', 'boulanger'] },
  'pâtissier': { codes: ['10.71D'], keywords: ['pâtisserie', 'pâtissier'] },
  'boucher': { codes: ['47.22Z', '10.13B'], keywords: ['boucherie', 'charcuterie'] },
  'poissonnier': { codes: ['47.23Z'], keywords: ['poissonnerie'] },
  'fromager': { codes: ['47.29Z'], keywords: ['fromagerie', 'crémerie'] },
  'caviste': { codes: ['47.25Z'], keywords: ['caviste', 'vin'] },
  'coiffeur': { codes: ['96.02A'], keywords: ['coiffure', 'salon coiffure'] },
  'esthéticienne': { codes: ['96.02B'], keywords: ['esthétique', 'institut beauté'] },
  'opticien': { codes: ['47.78A'], keywords: ['opticien', 'lunetterie'] },
  'bijoutier': { codes: ['47.77Z'], keywords: ['bijouterie', 'joaillerie'] },
  'fleuriste': { codes: ['47.76Z'], keywords: ['fleuriste'] },
  'pressing': { codes: ['96.01A', '96.01B'], keywords: ['pressing', 'blanchisserie'] },
  'tabac': { codes: ['47.26Z'], keywords: ['tabac', 'bureau tabac'] },
  'photographe': { codes: ['74.20Z'], keywords: ['photographe', 'studio photo'] },

  // ── Restauration / hôtellerie ──────────────────────────────────
  'restaurateur': { codes: ['56.10A', '56.10B', '56.10C'], keywords: ['restaurant', 'restauration'] },
  'restaurant': { codes: ['56.10A', '56.10B', '56.10C'], keywords: ['restaurant'] },
  'bar': { codes: ['56.30Z'], keywords: ['bar', 'café', 'débit boisson'] },
  'traiteur': { codes: ['56.21Z'], keywords: ['traiteur', 'évènementiel'] },
  'hôtelier': { codes: ['55.10Z', '55.20Z'], keywords: ['hôtel', 'hôtellerie'] },
  'gîte': { codes: ['55.20Z'], keywords: ['gîte', 'chambre hôte'] },

  // ── BTP / construction ─────────────────────────────────────────
  'promoteur immobilier': { codes: ['41.10A', '41.10B'], keywords: ['promotion immobilière', 'promoteur'] },
  'constructeur maison': { codes: ['41.20A'], keywords: ['constructeur maisons individuelles'] },
  'maçon': { codes: ['43.99C', '43.99A'], keywords: ['maçonnerie', 'maçon'] },
  'plombier': { codes: ['43.22A'], keywords: ['plomberie', 'plombier'] },
  'électricien': { codes: ['43.21A'], keywords: ['électricité', 'électricien'] },
  'chauffagiste': { codes: ['43.22B'], keywords: ['chauffage', 'chauffagiste'] },
  'menuisier': { codes: ['43.32A', '16.23Z'], keywords: ['menuiserie', 'menuisier'] },
  'couvreur': { codes: ['43.91A', '43.91B'], keywords: ['couverture', 'couvreur', 'toiture'] },
  'peintre': { codes: ['43.34Z'], keywords: ['peinture bâtiment', 'peintre'] },
  'carreleur': { codes: ['43.33Z'], keywords: ['carrelage', 'revêtement'] },
  'paysagiste': { codes: ['81.30Z'], keywords: ['paysagiste', 'jardins'] },
  'btp': {
    codes: ['41.10A', '41.10B', '41.20A', '41.20B', '43.11Z', '43.21A', '43.22A', '43.32A', '43.34Z'],
    keywords: ['BTP', 'bâtiment', 'travaux publics'],
  },

  // ── Industrie ──────────────────────────────────────────────────
  'industriel': {
    codes: ['25.99B', '28.99B', '29.10Z', '30.99Z'],
    keywords: ['fabrication', 'industriel', 'industrie'],
  },
  'agroalimentaire': {
    codes: ['10.11Z', '10.13B', '10.41A', '10.51A', '10.71B', '10.86Z'],
    keywords: ['agroalimentaire', 'alimentaire'],
  },
  'métallurgie': { codes: ['25.50A', '25.50B', '25.62B'], keywords: ['métallurgie', 'mécanique précision'] },
  'plasturgie': { codes: ['22.21Z', '22.29A'], keywords: ['plasturgie', 'plastique'] },
  'chimie': { codes: ['20.59Z', '21.20Z'], keywords: ['chimie', 'cosmétique'] },

  // ── Tech / numérique ───────────────────────────────────────────
  'développeur': { codes: ['62.01Z', '62.02A'], keywords: ['développement logiciel', 'développeur'] },
  'éditeur logiciel': { codes: ['58.29A', '58.29B', '58.29C', '62.01Z'], keywords: ['éditeur logiciel', 'SaaS'] },
  'saas': { codes: ['62.01Z', '58.29C'], keywords: ['SaaS', 'logiciel'] },
  'ssii': { codes: ['62.02A', '62.02B'], keywords: ['ESN', 'SSII', 'services informatiques'] },
  'agence web': { codes: ['62.01Z', '73.11Z'], keywords: ['agence web', 'digital'] },
  'startup': { codes: ['62.01Z', '63.11Z', '58.29C'], keywords: ['startup', 'tech', 'innovation'] },
  'hébergement web': { codes: ['63.11Z'], keywords: ['hébergement', 'hosting', 'datacenter'] },

  // ── Immobilier / gestion / patrimoine ──────────────────────────
  'agent immobilier': { codes: ['68.31Z'], keywords: ['agence immobilière', 'agent immobilier'] },
  'loueur': { codes: ['68.20A', '68.20B'], keywords: ['location immobilière', 'SCI'] },
  'sci': { codes: ['68.20A', '68.20B'], keywords: ['SCI', 'société civile immobilière'] },
  'syndic': { codes: ['68.32A', '68.32B'], keywords: ['syndic', 'administration biens'] },

  // ── Conseil / services aux entreprises ─────────────────────────
  'consultant': { codes: ['70.22Z', '74.90B'], keywords: ['conseil', 'consultant'] },
  'cabinet conseil': { codes: ['70.22Z'], keywords: ['conseil aux entreprises', 'consulting'] },
  'cabinet recrutement': { codes: ['78.10Z', '74.90B'], keywords: ['recrutement', 'chasse de têtes'] },
  'rh': { codes: ['78.10Z', '78.20Z', '74.90B'], keywords: ['ressources humaines', 'gestion RH'] },
  'communication': { codes: ['70.21Z', '73.11Z'], keywords: ['communication', 'agence com'] },
  'marketing': { codes: ['73.11Z', '73.12Z'], keywords: ['marketing', 'agence marketing'] },
  'études marché': { codes: ['73.20Z'], keywords: ['études de marché', 'sondage'] },
  'formation': { codes: ['85.59A', '85.59B'], keywords: ['formation', 'organisme formation'] },

  // ── Finance / assurance ────────────────────────────────────────
  'courtier': { codes: ['66.19B', '66.22Z'], keywords: ['courtier', 'courtage'] },
  'courtier assurance': { codes: ['66.22Z'], keywords: ['courtier assurance', 'cabinet assurance'] },
  'assurance': { codes: ['65.11Z', '65.12Z', '66.22Z'], keywords: ['assurance', 'cabinet assurance'] },
  'cgp': { codes: ['66.19B', '70.22Z'], keywords: ['gestion patrimoine', 'CGP'] },
  'gestion de patrimoine': { codes: ['66.19B'], keywords: ['gestion patrimoine', 'family office'] },
  'family office': { codes: ['64.20Z', '66.19B'], keywords: ['family office', 'multi-family'] },
  'holding': { codes: ['64.20Z', '64.99Z'], keywords: ['holding', 'société de tête'] },
  'asset management': { codes: ['66.30Z'], keywords: ['gestion actifs', 'asset management'] },
  'capital investissement': { codes: ['64.30Z', '66.30Z'], keywords: ['private equity', 'capital risque'] },

  // ── Agriculture / viticulture ──────────────────────────────────
  'agriculteur': { codes: ['01.11Z', '01.13Z', '01.41Z', '01.50Z'], keywords: ['exploitation agricole', 'agriculteur'] },
  'viticulteur': { codes: ['01.21Z', '11.02A', '11.02B'], keywords: ['viticulture', 'domaine viticole', 'vigneron'] },
  'éleveur': { codes: ['01.41Z', '01.42Z', '01.45Z', '01.47Z'], keywords: ['élevage', 'éleveur'] },

  // ── Transport / logistique ─────────────────────────────────────
  'transporteur': { codes: ['49.41A', '49.41B'], keywords: ['transport routier', 'transporteur'] },
  'logistique': { codes: ['52.10A', '52.10B', '52.29A'], keywords: ['logistique', 'entreposage'] },

  // ── Énergie / environnement ────────────────────────────────────
  'énergies renouvelables': { codes: ['35.11Z', '43.21A'], keywords: ['solaire', 'éolien', 'photovoltaïque'] },
  'recyclage': { codes: ['38.32Z', '38.11Z'], keywords: ['recyclage', 'valorisation déchets'] },
}

export function mapRolesToNaf(roles: string[]): { codes: string[]; keywords: string[] } {
  const codes = new Set<string>()
  const keywords = new Set<string>()

  for (const role of roles) {
    const lower = role.toLowerCase()
    for (const [key, val] of Object.entries(NAF_MAP)) {
      if (lower.includes(key) || key.split(' ').every((w) => lower.includes(w))) {
        val.codes.forEach((c) => codes.add(c))
        val.keywords.forEach((k) => keywords.add(k))
      }
    }
  }

  // Fallback : utiliser le rôle brut comme keyword
  if (codes.size === 0 && keywords.size === 0) {
    roles.forEach((r) => keywords.add(r))
  }

  return { codes: Array.from(codes), keywords: Array.from(keywords) }
}

/**
 * Mapping secteurs ICP → codes NAF. Les secteurs sont plus larges que les rôles
 * (ex: "santé" couvre toute la 86.xx) et peuvent enrichir la recherche en
 * complément des rôles précis.
 *
 * Utilisé par engine.ts via mapSectorsToNaf() — corrige le bug silencieux
 * où criteria.sectors était parsé mais jamais lu par le moteur.
 */
const SECTOR_NAF_MAP: Record<string, string[]> = {
  'santé': ['86.21Z', '86.22A', '86.22B', '86.22C', '86.22D', '86.23Z', '86.90A', '86.90C', '86.90D', '86.90E', '86.90F'],
  'medical': ['86.21Z', '86.22A', '86.22B', '86.22C', '86.23Z', '86.90A'],
  'paramédical': ['86.90A', '86.90C', '86.90D', '86.90E', '86.90F'],
  'juridique': ['69.10Z'],
  'comptable': ['69.20Z'],
  'audit': ['69.20Z'],
  'btp': ['41.10A', '41.10B', '41.20A', '41.20B', '43.11Z', '43.21A', '43.22A', '43.32A', '43.34Z'],
  'construction': ['41.20A', '41.20B', '43.11Z', '43.99A'],
  'bâtiment': ['41.20A', '43.11Z', '43.99A', '43.99C'],
  'restauration': ['56.10A', '56.10B', '56.10C', '56.21Z', '56.30Z'],
  'hôtellerie': ['55.10Z', '55.20Z', '55.30Z'],
  'tourisme': ['55.10Z', '55.20Z', '79.11Z', '79.12Z'],
  'artisanat': ['10.71B', '47.22Z', '96.02A', '47.78A', '43.32A'],
  'commerce': ['47.11D', '47.22Z', '47.73Z', '47.76Z', '47.77Z', '47.78A'],
  'industrie': ['10.11Z', '20.59Z', '22.21Z', '25.50A', '28.99B', '29.10Z'],
  'agroalimentaire': ['10.11Z', '10.13B', '10.41A', '10.51A', '10.71B', '10.86Z', '11.02A'],
  'agriculture': ['01.11Z', '01.13Z', '01.21Z', '01.41Z', '01.50Z'],
  'viticulture': ['01.21Z', '11.02A', '11.02B'],
  'élevage': ['01.41Z', '01.42Z', '01.45Z', '01.47Z'],
  'tech': ['58.29A', '58.29B', '58.29C', '62.01Z', '62.02A', '62.02B', '63.11Z'],
  'numérique': ['58.29C', '62.01Z', '62.02A', '63.11Z'],
  'saas': ['62.01Z', '58.29C'],
  'logiciel': ['58.29A', '58.29B', '58.29C', '62.01Z'],
  'informatique': ['62.01Z', '62.02A', '62.02B', '63.11Z'],
  'immobilier': ['41.10A', '41.10B', '68.20A', '68.20B', '68.31Z', '68.32A'],
  'finance': ['64.19Z', '64.20Z', '64.30Z', '64.99Z', '66.19B', '66.30Z'],
  'assurance': ['65.11Z', '65.12Z', '65.20Z', '66.22Z'],
  'conseil': ['70.21Z', '70.22Z', '73.20Z', '74.90B'],
  'communication': ['70.21Z', '73.11Z', '73.12Z'],
  'marketing': ['73.11Z', '73.12Z'],
  'rh': ['78.10Z', '78.20Z', '78.30Z'],
  'formation': ['85.59A', '85.59B', '85.60Z'],
  'transport': ['49.20Z', '49.41A', '49.41B', '50.10Z', '51.10Z'],
  'logistique': ['52.10A', '52.10B', '52.29A'],
  'énergie': ['35.11Z', '35.12Z', '35.14Z'],
  'environnement': ['38.11Z', '38.21Z', '38.32Z', '39.00Z'],
}

export function mapSectorsToNaf(sectors: string[]): string[] {
  const codes = new Set<string>()
  for (const sector of sectors) {
    const lower = sector
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Mn}/gu, '')
    for (const [key, vals] of Object.entries(SECTOR_NAF_MAP)) {
      const normKey = key.normalize('NFD').replace(/\p{Mn}/gu, '')
      if (lower.includes(normKey) || normKey.includes(lower)) {
        vals.forEach((c) => codes.add(c))
      }
    }
  }
  return Array.from(codes)
}

// Mapping localisations ICP → codes département INSEE
export function mapLocationsToDepartements(locations: string[]): string[] {
  const DEPT_MAP: Record<string, string[]> = {
    'île-de-france': ['75', '77', '78', '91', '92', '93', '94', '95'],
    'idf': ['75', '77', '78', '91', '92', '93', '94', '95'],
    'paris': ['75'],
    'hauts-de-seine': ['92'],
    'val-de-marne': ['94'],
    'seine-saint-denis': ['93'],
    'lyon': ['69'],
    'marseille': ['13'],
    'bordeaux': ['33'],
    'toulouse': ['31'],
    'nantes': ['44'],
    'lille': ['59'],
    'strasbourg': ['67'],
    'nice': ['06'],
    'montpellier': ['34'],
    'rennes': ['35'],
    'auvergne-rhone-alpes': ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'],
    'paca': ['04', '05', '06', '13', '83', '84'],
    'occitanie': ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'],
    'bretagne': ['22', '29', '35', '56'],
    'normandie': ['14', '27', '50', '61', '76'],
    'grand est': ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'],
    'hauts-de-france': ['02', '59', '60', '62', '80'],
    'nouvelle-aquitaine': ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'],
    'pays de la loire': ['44', '49', '53', '72', '85'],
    'centre-val de loire': ['18', '28', '36', '37', '41', '45'],
    'bourgogne-franche-comte': ['21', '25', '39', '58', '70', '71', '89', '90'],
    'france': [], // national = no filter
  }

  const depts = new Set<string>()

  for (const loc of locations) {
    // Normalize: lowercase + strip diacritics
    const lower = loc
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Mn}/gu, '')

    for (const [key, codes] of Object.entries(DEPT_MAP)) {
      const normKey = key
        .normalize('NFD')
        .replace(/\p{Mn}/gu, '')

      if (lower.includes(normKey) || normKey.includes(lower)) {
        codes.forEach((c) => depts.add(c))
      }
    }

    // Code département direct (ex: "75", "92")
    if (/^\d{2,3}$/.test(loc)) depts.add(loc)
  }

  return Array.from(depts)
}

// ─────────────────────────────────────────────────────────────────────────
// Adjacence départementale France métropolitaine.
// Source : géographie administrative (frontières communes).
// Utilisé pour élargir une recherche "Lyon" (69) aux départements limitrophes
// (01, 38, 42, 71). Comportement opt-in via criteria.geo_strict.
// ─────────────────────────────────────────────────────────────────────────

const DEPT_ADJACENCY: Record<string, string[]> = {
  '01': ['38', '39', '69', '71', '73', '74'],
  '02': ['08', '51', '59', '60', '77', '80'],
  '03': ['18', '23', '42', '58', '63', '71'],
  '04': ['05', '06', '26', '83', '84'],
  '05': ['04', '26', '38', '73'],
  '06': ['04', '83'],
  '07': ['26', '30', '38', '42', '43', '48'],
  '08': ['02', '51', '55'],
  '09': ['11', '31', '66'],
  '10': ['21', '51', '52', '77', '89'],
  '11': ['09', '31', '34', '66', '81'],
  '12': ['15', '30', '34', '46', '48', '81', '82'],
  '13': ['30', '83', '84'],
  '14': ['27', '50', '61', '76'],
  '15': ['12', '19', '43', '46', '48', '63'],
  '16': ['17', '24', '79', '86', '87'],
  '17': ['16', '33', '79', '85'],
  '18': ['03', '23', '36', '41', '45', '58'],
  '19': ['15', '23', '24', '46', '63', '87'],
  '21': ['10', '39', '52', '58', '70', '71', '89'],
  '22': ['29', '35', '56'],
  '23': ['03', '18', '19', '36', '63', '87'],
  '24': ['16', '19', '33', '46', '47', '87'],
  '25': ['39', '70', '90'],
  '26': ['04', '05', '07', '38', '84'],
  '27': ['14', '28', '60', '61', '76', '78', '95'],
  '28': ['27', '41', '45', '61', '72', '78', '91'],
  '29': ['22', '56'],
  '30': ['07', '12', '13', '34', '48', '84'],
  '31': ['09', '11', '32', '65', '81', '82'],
  '32': ['31', '40', '47', '64', '65', '82'],
  '33': ['17', '24', '40', '47'],
  '34': ['11', '12', '30', '81'],
  '35': ['22', '44', '49', '50', '53', '56'],
  '36': ['18', '23', '37', '41', '86', '87'],
  '37': ['36', '41', '49', '72', '86'],
  '38': ['01', '05', '07', '26', '42', '69', '73'],
  '39': ['01', '21', '25', '70', '71'],
  '40': ['32', '33', '47', '64'],
  '41': ['18', '28', '36', '37', '45', '72'],
  '42': ['03', '07', '43', '63', '69', '71'],
  '43': ['07', '15', '42', '48', '63'],
  '44': ['35', '49', '56', '85'],
  '45': ['18', '28', '41', '58', '77', '89', '91'],
  '46': ['12', '15', '19', '24', '47', '82'],
  '47': ['24', '32', '33', '40', '46', '82'],
  '48': ['07', '12', '15', '30', '43'],
  '49': ['35', '37', '44', '53', '72', '79', '85', '86'],
  '50': ['14', '35', '53', '61'],
  '51': ['02', '08', '10', '52', '55', '77'],
  '52': ['10', '21', '54', '55', '70', '88'],
  '53': ['35', '49', '50', '61', '72'],
  '54': ['52', '55', '57', '67', '88'],
  '55': ['08', '51', '52', '54'],
  '56': ['22', '29', '35', '44'],
  '57': ['54', '67'],
  '58': ['03', '18', '21', '45', '71', '89'],
  '59': ['02', '62', '80'],
  '60': ['02', '27', '76', '77', '80', '95'],
  '61': ['14', '27', '28', '50', '53', '72'],
  '62': ['59', '80'],
  '63': ['03', '15', '19', '23', '42', '43'],
  '64': ['32', '40', '65'],
  '65': ['31', '32', '64'],
  '66': ['09', '11'],
  '67': ['54', '57', '68', '88'],
  '68': ['67', '70', '88', '90'],
  '69': ['01', '38', '42', '71'],
  '70': ['21', '25', '52', '68', '88', '90'],
  '71': ['01', '03', '21', '39', '42', '58', '69'],
  '72': ['28', '37', '41', '49', '53', '61'],
  '73': ['01', '05', '38', '74'],
  '74': ['01', '73'],
  '75': ['92', '93', '94'],
  '76': ['14', '27', '60', '80'],
  '77': ['02', '10', '45', '51', '60', '89', '91', '93', '94', '95'],
  '78': ['27', '28', '91', '92', '95'],
  '79': ['16', '17', '49', '85', '86'],
  '80': ['02', '59', '60', '62', '76'],
  '81': ['11', '12', '31', '34', '82'],
  '82': ['12', '31', '32', '46', '47', '81'],
  '83': ['04', '06', '13', '84'],
  '84': ['04', '13', '26', '30', '83'],
  '85': ['17', '44', '49', '79'],
  '86': ['16', '36', '37', '49', '79', '87'],
  '87': ['16', '19', '23', '24', '36', '86'],
  '88': ['52', '54', '67', '68', '70'],
  '89': ['10', '21', '45', '58', '77'],
  '90': ['25', '68', '70'],
  '91': ['28', '45', '77', '78', '92', '94'],
  '92': ['75', '78', '91', '93', '94', '95'],
  '93': ['75', '77', '92', '94', '95'],
  '94': ['75', '77', '91', '92', '93'],
  '95': ['27', '60', '77', '78', '92', '93'],
  // Corse — pas d'adjacence avec la métropole
  '2A': ['2B'],
  '2B': ['2A'],
}

/**
 * Renvoie les codes département limitrophes du dept passé en argument.
 * Le dept lui-même n'est PAS inclus.
 */
export function adjacentDepartements(dept: string): string[] {
  return DEPT_ADJACENCY[dept] ?? []
}

/**
 * Élargit un ensemble de départements à leurs voisins immédiats.
 * Lyon (69) → [69, 01, 38, 42, 71]. Idempotent.
 */
export function expandWithAdjacent(depts: string[]): string[] {
  const out = new Set<string>(depts)
  for (const d of depts) {
    for (const adj of adjacentDepartements(d)) out.add(adj)
  }
  return Array.from(out)
}
