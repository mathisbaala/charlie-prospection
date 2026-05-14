import Anthropic from '@anthropic-ai/sdk'
import type { ProspectEnrichmentData } from '@/lib/types'

const SCORING_PROMPT = (enrichment: ProspectEnrichmentData) => `Tu es expert en gestion de patrimoine (CGP) en France.

Analyse ce profil et estime le score patrimonial (0-100) et le patrimoine total estimé.

## Profil prospect
- Dirigeant: ${enrichment.dirigeant_prenom} ${enrichment.dirigeant_nom}, ${enrichment.dirigeant_qualite}
- Âge estimé: ${enrichment.dirigeant_annee_naissance ? new Date().getFullYear() - enrichment.dirigeant_annee_naissance + ' ans' : 'inconnu'}
- Entreprise: ${enrichment.code_naf} - ${enrichment.libelle_naf}
- Date création entreprise: ${enrichment.date_creation_entreprise ?? 'inconnue'}
- Effectifs: ${enrichment.tranche_effectifs ?? 'inconnu'}
- Localisation: ${enrichment.ville} (${enrichment.departement})

## Signaux BODACC (${enrichment.bodacc_events?.length ?? 0} événements)
${enrichment.bodacc_events?.map(e => `- ${e.date}: ${e.type} — ${e.libelle}`).join('\n') || 'Aucun'}

## Transactions immobilières zone (DVF)
${enrichment.dvf_transactions?.slice(0, 3).map(t => `- ${t.date_mutation}: ${t.nature_mutation} ${t.type_local} ${t.surface_reelle_bati ? t.surface_reelle_bati + 'm²' : ''} — ${t.valeur_fonciere.toLocaleString('fr-FR')}€ à ${t.commune}`).join('\n') || 'Aucune transaction connue'}

## Instructions
Réponds UNIQUEMENT en JSON valide, sans markdown:
{
  "score": <0-100>,
  "patrimoine_total_estime": <montant en euros ou null>,
  "valeur_entreprise_estimee": <montant en euros ou null>,
  "revenus_implicites_estimes": <montant annuel en euros ou null>,
  "niveau": <"faible" | "moyen" | "fort" | "prioritaire">,
  "raison_principale": "<1 phrase expliquant le score>"
}`

export async function scorePatrimony(enrichment: ProspectEnrichmentData): Promise<{
  score: number
  patrimoine_total_estime: number | null
  valeur_entreprise_estimee: number | null
  revenus_implicites_estimes: number | null
  niveau: 'faible' | 'moyen' | 'fort' | 'prioritaire'
  raison_principale: string
}> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: SCORING_PROMPT(enrichment) }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    const result = JSON.parse(cleaned)

    return {
      score: Math.min(100, Math.max(0, result.score ?? 30)),
      patrimoine_total_estime: result.patrimoine_total_estime ?? null,
      valeur_entreprise_estimee: result.valeur_entreprise_estimee ?? null,
      revenus_implicites_estimes: result.revenus_implicites_estimes ?? null,
      niveau: result.niveau ?? 'moyen',
      raison_principale: result.raison_principale ?? '',
    }
  } catch {
    return {
      score: 30,
      patrimoine_total_estime: null,
      valeur_entreprise_estimee: null,
      revenus_implicites_estimes: null,
      niveau: 'moyen',
      raison_principale: 'Données insuffisantes pour scoring précis',
    }
  }
}
