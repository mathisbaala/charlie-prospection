import Anthropic from '@anthropic-ai/sdk'
import type { ParsedIcpCriteria, SignalType, TargetType } from '@/lib/types'

export function buildIcpParserPrompt(description: string): string {
  return `Tu es un assistant spécialisé pour des CGPs (Conseillers en Gestion de Patrimoine) en France.

Un CGP vient de décrire son client idéal (ICP) en langage naturel :
"${description}"

Analyse cette description et retourne un JSON structuré avec exactement ces champs :
{
  "target_type": "personne_morale" | "personne_physique" | "both",
  "roles": ["liste des rôles/métiers ciblés"],
  "sectors": ["liste des secteurs d'activité"],
  "locations": ["liste des villes/régions"],
  "seniority_min_years": null ou nombre d'années minimum d'ancienneté,
  "patrimony_level": "standard" | "high" | "very_high",
  "ca_min": null ou chiffre d'affaires minimum en euros,
  "ca_max": null ou chiffre d'affaires maximum en euros,
  "effectif_min": null ou effectif salarié minimum,
  "effectif_max": null ou effectif salarié maximum,
  "age_min": null ou âge minimum du dirigeant,
  "age_max": null ou âge maximum du dirigeant,
  "geo_strict": false par défaut — true uniquement si l'utilisateur exclut explicitement les départements adjacents (rare),
  "keywords": ["mots-clés LinkedIn pertinents pour la recherche"],
  "signal_priorities": ["types de signaux les plus pertinents pour ce profil"],
  "linkedin_queries": ["2-3 requêtes LinkedIn optimisées pour trouver ces profils"]
}

Règle pour target_type :
- "personne_morale" si la cible est avant tout une entreprise (dirigeant de PME, startup, holding, SCI, cabinet) — le patrimoine est lié à la structure
- "personne_physique" si la cible est un individu exerçant en libéral ou salarié (médecin, avocat, notaire, chirurgien, professionnel de santé, salarié à fort revenu) — le patrimoine est personnel
- "both" si les deux types coexistent dans la description

Règles pour les seuils financiers (ca_min, ca_max, effectif_min, effectif_max) :
- Extrait ces seuils UNIQUEMENT si l'utilisateur les exprime explicitement ("PME 5-50M€ CA", "plus de 20 salariés", "ETI")
- Conversion : "M€" = 1_000_000, "k€" = 1_000
- ETI (PME intermédiaire) ≈ ca_min: 50_000_000, effectif_min: 250
- PME ≈ ca_min: 1_000_000, ca_max: 50_000_000, effectif_min: 10, effectif_max: 250
- Pour les libéraux (médecins, avocats indépendants) : laisse ces seuils à null sauf indication contraire
- N'invente RIEN. Mets null si non exprimé.

Règles pour age_min / age_max :
- "proche de la retraite" → age_min: 55
- "fin de carrière" → age_min: 58
- "quadra/quinqua" → 40-60
- Sinon null

Pour signal_priorities, utilise uniquement ces valeurs : cession_entreprise, levee_fonds, creation_holding, transaction_immo, nouveau_poste, installation_cabinet, post_linkedin, retraite_imminente, divorce, succession, augmentation_capital.

Réponds UNIQUEMENT avec le JSON, sans markdown, sans explication.`
}

function nullableNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && isFinite(v) && v > 0) return v
  return undefined
}

function nullableBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v
  return undefined
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
        target_type: (parsed.target_type ?? 'personne_morale') as TargetType,
        roles: parsed.roles ?? [],
        sectors: parsed.sectors ?? [],
        locations: parsed.locations ?? [],
        seniority_min_years: parsed.seniority_min_years ?? undefined,
        patrimony_level: parsed.patrimony_level ?? undefined,
        keywords: parsed.keywords ?? [],
        signal_priorities: (parsed.signal_priorities ?? []) as SignalType[],
        ca_min: nullableNumber(parsed.ca_min),
        ca_max: nullableNumber(parsed.ca_max),
        effectif_min: nullableNumber(parsed.effectif_min),
        effectif_max: nullableNumber(parsed.effectif_max),
        age_min: nullableNumber(parsed.age_min),
        age_max: nullableNumber(parsed.age_max),
        geo_strict: nullableBool(parsed.geo_strict),
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
