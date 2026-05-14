import Anthropic from '@anthropic-ai/sdk'
import type { ParsedIcpCriteria, SignalType } from '@/lib/types'

export function buildIcpParserPrompt(description: string): string {
  return `Tu es un assistant spécialisé pour des CGPs (Conseillers en Gestion de Patrimoine) en France.

Un CGP vient de décrire son client idéal (ICP) en langage naturel :
"${description}"

Analyse cette description et retourne un JSON structuré avec exactement ces champs :
{
  "roles": ["liste des rôles/métiers ciblés"],
  "sectors": ["liste des secteurs d'activité"],
  "locations": ["liste des villes/régions"],
  "seniority_min_years": null ou nombre d'années minimum d'ancienneté,
  "patrimony_level": "standard" | "high" | "very_high",
  "keywords": ["mots-clés LinkedIn pertinents pour la recherche"],
  "signal_priorities": ["types de signaux les plus pertinents pour ce profil"],
  "linkedin_queries": ["2-3 requêtes LinkedIn optimisées pour trouver ces profils"]
}

Pour signal_priorities, utilise uniquement ces valeurs : cession_entreprise, levee_fonds, creation_holding, transaction_immo, nouveau_poste, installation_cabinet, post_linkedin, retraite_imminente, divorce, succession, augmentation_capital.

Réponds UNIQUEMENT avec le JSON, sans markdown, sans explication.`
}

export function parseIcpResponse(text: string): {
  criteria: ParsedIcpCriteria
  linkedinQueries: string[]
} {
  const empty: ParsedIcpCriteria = {
    roles: [], sectors: [], locations: [],
    keywords: [], signal_priorities: [],
  }
  try {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(clean)
    return {
      criteria: {
        roles: parsed.roles ?? [],
        sectors: parsed.sectors ?? [],
        locations: parsed.locations ?? [],
        seniority_min_years: parsed.seniority_min_years ?? undefined,
        patrimony_level: parsed.patrimony_level ?? undefined,
        keywords: parsed.keywords ?? [],
        signal_priorities: (parsed.signal_priorities ?? []) as SignalType[],
      },
      linkedinQueries: parsed.linkedin_queries ?? [],
    }
  } catch {
    return { criteria: empty, linkedinQueries: [] }
  }
}

export async function parseIcp(description: string) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: buildIcpParserPrompt(description) }],
  })
  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  return parseIcpResponse(text)
}
