import { describe, it, expect } from 'vitest'
import { parseRppsCsvLine, RPPS_PROFESSIONS_CIBLES } from '../parse'

const headers = [
  'Identifiant PP',
  "Nom d'exercice",
  "Prénom d'exercice",
  'Libellé profession',
  'Libellé catégorie professionnelle',
  "Code mode d'exercice",
  'Libellé commune (structure)',
  'Code postal (structure)',
]

describe('parseRppsCsvLine', () => {
  it('parses a valid libéral médecin line', () => {
    const line = 'RPPS123456789;DUPONT;Jean;Médecin;;L;LYON;69003'
    const result = parseRppsCsvLine(line, headers)
    expect(result).not.toBeNull()
    expect(result!.rpps_id).toBe('RPPS123456789')
    expect(result!.nom).toBe('DUPONT')
    expect(result!.prenom).toBe('Jean')
    expect(result!.profession).toBe('Médecin')
    expect(result!.mode_exercice).toBe('L')
    expect(result!.ville).toBe('LYON')
    expect(result!.code_postal).toBe('69003')
  })

  it('returns null for salarié practitioners (mode_exercice != L)', () => {
    const line = 'RPPS999;DUPONT;Jean;Médecin;;S;LYON;69003'
    expect(parseRppsCsvLine(line, headers)).toBeNull()
  })

  it('returns null for non-targeted professions', () => {
    const line = 'RPPS999;DUPONT;Jean;Pédicure-podologue;;L;LYON;69003'
    expect(parseRppsCsvLine(line, headers)).toBeNull()
  })

  it('returns null for empty rpps_id', () => {
    const line = ';DUPONT;Jean;Médecin;;L;LYON;69003'
    expect(parseRppsCsvLine(line, headers)).toBeNull()
  })

  it('handles Chirurgien-Dentiste profession', () => {
    const line = 'RPPS888;MARTIN;Sophie;Chirurgien-Dentiste;;L;PARIS;75001'
    const result = parseRppsCsvLine(line, headers)
    expect(result).not.toBeNull()
    expect(result!.profession).toBe('Chirurgien-Dentiste')
  })
})

describe('RPPS_PROFESSIONS_CIBLES', () => {
  it('includes Médecin and Chirurgien-Dentiste', () => {
    expect(RPPS_PROFESSIONS_CIBLES).toContain('Médecin')
    expect(RPPS_PROFESSIONS_CIBLES).toContain('Chirurgien-Dentiste')
  })
})
