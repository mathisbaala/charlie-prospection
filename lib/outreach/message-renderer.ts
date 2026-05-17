// Remplace les variables {{firstName}}, {{company}}, etc. dans un template
// en utilisant les données de la fiche patrimoniale du prospect.

import type { Prospect, ProspectEnrichmentData, TemplateVariables } from '@/lib/types'

export function extractTemplateVars(prospect: Prospect): TemplateVariables {
  const e = (prospect.enrichment_data ?? {}) as ProspectEnrichmentData
  const ld = (prospect.linkedin_data ?? {}) as Record<string, unknown>

  const firstName = String(e.dirigeant_prenom ?? ld.prenom ?? '').trim() || 'X'
  const lastName = String(e.dirigeant_nom ?? ld.nom ?? '').trim()
  const company =
    String((e as Record<string, unknown>).entreprise_nom ?? ld.entreprise ?? '').trim() || ''
  const city = String(e.ville ?? '').trim()
  const role = String(ld.titre ?? e.dirigeant_qualite ?? '').trim()
  const sector = String(e.libelle_naf ?? '').trim()

  // Signal le plus récent (texte court pour personnalisation)
  const recentSignal = buildRecentSignalSnippet(e)

  return { firstName, lastName, company, city, role, sector, recentSignal }
}

function buildRecentSignalSnippet(e: ProspectEnrichmentData): string {
  const events = e.bodacc_events
  if (events?.length) {
    const latest = events.sort((a, b) => b.date.localeCompare(a.date))[0]
    return latest.libelle ?? latest.type ?? ''
  }
  return ''
}

export function renderTemplate(template: string, vars: TemplateVariables): string {
  return template
    .replace(/\{\{firstName\}\}/g, vars.firstName)
    .replace(/\{\{lastName\}\}/g, vars.lastName)
    .replace(/\{\{fullName\}\}/g, `${vars.firstName} ${vars.lastName}`.trim())
    .replace(/\{\{company\}\}/g, vars.company)
    .replace(/\{\{city\}\}/g, vars.city)
    .replace(/\{\{role\}\}/g, vars.role)
    .replace(/\{\{sector\}\}/g, vars.sector)
    .replace(/\{\{recentSignal\}\}/g, vars.recentSignal)
}
