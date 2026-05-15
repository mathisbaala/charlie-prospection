import type { Icp, Prospect, ProspectEnrichmentData } from '@/lib/types'

/**
 * Escape a single CSV cell value following RFC 4180:
 *   - wrap in double quotes if value contains comma, quote, newline, or carriage return
 *   - double up internal quotes
 *   - convert nullish to empty string
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  // Strip control chars that break Excel (except tab → space)
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').replace(/\t/g, ' ')
  if (/[",\r\n]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

/** CSV row builder — joins escaped cells with commas. */
export function buildCsvRow(cells: unknown[]): string {
  return cells.map(escapeCsvCell).join(',')
}

const HEADER = [
  'id',
  'nom',
  'prenom',
  'entreprise',
  'role',
  'persona',
  'crm_stage',
  'patrimony_score',
  'niveau',
  'ca_dernier',
  'patrimoine_estime',
  'ville',
  'departement',
  'code_naf',
  'libelle_naf',
  'siren',
  'linkedin_url',
  'last_signal_at',
  'created_at',
]

/**
 * Format a prospect (+ its persona name) as a single CSV row matching HEADER.
 * No I/O — pure transform, testable in isolation.
 */
export function prospectToCsvRow(prospect: Prospect, personaName: string | null): string {
  const ed = (prospect.enrichment_data ?? {}) as ProspectEnrichmentData & Record<string, unknown>
  const ld = (prospect.linkedin_data ?? {}) as Record<string, unknown>

  return buildCsvRow([
    prospect.id,
    ed.dirigeant_nom ?? ld.nom_de_famille ?? '',
    ed.dirigeant_prenom ?? ld.prenom ?? '',
    ld.entreprise ?? ed.libelle_naf ?? '',
    ed.dirigeant_qualite ?? ld.titre ?? '',
    personaName ?? '',
    prospect.crm_stage,
    prospect.patrimony_score ?? '',
    (ld as { niveau_patrimonial?: string }).niveau_patrimonial ?? '',
    ed.chiffre_affaires_dernier ?? '',
    ed.patrimoine_total_estime ?? '',
    ed.ville ?? '',
    ed.departement ?? '',
    ed.code_naf ?? '',
    ed.libelle_naf ?? '',
    ed.siren ?? '',
    prospect.linkedin_url ?? '',
    prospect.last_signal_at ?? '',
    prospect.created_at,
  ])
}

/**
 * Full CSV document for a set of prospects. The leading BOM ensures Excel
 * opens UTF-8 files correctly (otherwise accents render as gibberish on
 * Windows defaults).
 */
export function buildProspectsCsv(prospects: Prospect[], personas: Icp[]): string {
  const personaById = new Map(personas.map((p) => [p.id, p.name]))
  const lines: string[] = [HEADER.join(',')]
  for (const p of prospects) {
    const personaName = p.icp_id ? (personaById.get(p.icp_id) ?? null) : null
    lines.push(prospectToCsvRow(p, personaName))
  }
  return '﻿' + lines.join('\r\n') + '\r\n'
}
