export const RPPS_PROFESSIONS_CIBLES = [
  'Médecin',
  'Chirurgien-Dentiste',
  'Pharmacien',
  'Masseur-Kinésithérapeute',
  'Sage-Femme',
]

export interface RppsInsertRow {
  rpps_id: string
  nom: string
  prenom: string | null
  profession: string
  specialite: string | null
  mode_exercice: string
  ville: string | null
  code_postal: string | null
}

export function parseRppsCsvLine(
  line: string,
  headers: string[],
): RppsInsertRow | null {
  const fields = line.split('|')
  const get = (colName: string): string => {
    const idx = headers.indexOf(colName)
    return idx >= 0 ? (fields[idx] ?? '').trim() : ''
  }

  const rpps_id = get('Identifiant PP')
  if (!rpps_id) return null

  const mode_exercice = get("Code mode exercice")
  if (mode_exercice !== 'L') return null

  const profession = get('Libellé profession')
  if (!RPPS_PROFESSIONS_CIBLES.some((p) => profession.includes(p))) return null

  return {
    rpps_id,
    nom: get("Nom d'exercice") || rpps_id,
    prenom: get("Prénom d'exercice") || null,
    profession,
    specialite: get('Libellé catégorie professionnelle') || null,
    mode_exercice,
    ville: get('Libellé commune (structure)') || null,
    code_postal: get('Code postal (structure)') || null,
  }
}
