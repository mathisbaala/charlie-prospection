// Mapping ICP roles → codes NAF et mots-clés de recherche

export const NAF_MAP: Record<string, { codes: string[]; keywords: string[] }> = {
  'médecin généraliste': { codes: ['86.21Z'], keywords: ['médecin général'] },
  'médecin spécialiste': { codes: ['86.22A', '86.22B', '86.22C', '86.22D'], keywords: ['médecin spécialiste'] },
  'chirurgien': { codes: ['86.22A'], keywords: ['chirurgien'] },
  'dentiste': { codes: ['86.23Z'], keywords: ['dentiste', 'chirurgien-dentiste'] },
  'pharmacien': { codes: ['47.73Z'], keywords: ['pharmacie', 'pharmacien'] },
  'kinésithérapeute': { codes: ['86.90A'], keywords: ['kiné', 'kinésithérapeute'] },
  'infirmier': { codes: ['86.90C'], keywords: ['infirmier', 'cabinet infirmier'] },
  'vétérinaire': { codes: ['75.00Z'], keywords: ['vétérinaire'] },
  'avocat': { codes: ['69.10Z'], keywords: ['avocat', 'cabinet avocats'] },
  'expert comptable': { codes: ['69.20Z'], keywords: ['expert comptable', 'cabinet comptable'] },
  'notaire': { codes: ['69.10Z'], keywords: ['notaire', 'office notarial'] },
  'architecte': { codes: ['71.11Z'], keywords: ['architecte', 'cabinet architecture'] },
  'dirigeant': { codes: ['70.10Z', '70.22Z', '64.20Z'], keywords: ['holding', 'direction générale'] },
  'entrepreneur': { codes: [], keywords: ['entrepreneur', 'fondateur', 'dirigeant'] },
  "chef d'entreprise": { codes: [], keywords: ['directeur général', 'PDG', 'président'] },
  'directeur': { codes: [], keywords: ['directeur', 'direction'] },
  'libéral': { codes: ['86.21Z', '86.22A', '86.23Z', '69.10Z', '69.20Z'], keywords: ['libéral', 'cabinet'] },
  'professionnel de santé': {
    codes: ['86.21Z', '86.22A', '86.22B', '86.22C', '86.23Z', '86.90A', '86.90C'],
    keywords: ['santé', 'médical'],
  },
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
