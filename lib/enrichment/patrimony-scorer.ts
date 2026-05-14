import Anthropic from '@anthropic-ai/sdk'
import type { ProspectEnrichmentData } from '@/lib/types'

function fmtEuro(n?: number): string {
  if (n == null) return 'N/A'
  return n.toLocaleString('fr-FR') + '€'
}

const SCORING_PROMPT = (enrichment: ProspectEnrichmentData) => `Tu es expert en gestion de patrimoine (CGP) en France.

Analyse ce profil et estime le score patrimonial (0-100) et le patrimoine total estimé.

## Profil prospect
- Dirigeant: ${enrichment.dirigeant_prenom} ${enrichment.dirigeant_nom}, ${enrichment.dirigeant_qualite}
- Âge estimé: ${enrichment.dirigeant_annee_naissance ? new Date().getFullYear() - enrichment.dirigeant_annee_naissance + ' ans' : 'inconnu'}
- Entreprise: ${enrichment.code_naf} - ${enrichment.libelle_naf}
- Date création entreprise: ${enrichment.date_creation_entreprise ?? 'inconnue'}
- Forme juridique: ${enrichment.forme_juridique ?? 'inconnue'}
- Capital social: ${fmtEuro(enrichment.capital_social)}
- Effectifs: ${enrichment.tranche_effectifs ?? 'inconnu'}
- Localisation: ${enrichment.ville} (${enrichment.departement})
${enrichment.procedure_collective_en_cours ? '- ⚠️ Procédure collective en cours' : ''}

## Finances entreprise (dernier exercice)
- Chiffre d'affaires: ${fmtEuro(enrichment.chiffre_affaires_dernier)}
- Résultat net: ${fmtEuro(enrichment.resultat_dernier)}
- Taux de marge EBITDA: ${enrichment.taux_marge_dernier != null ? enrichment.taux_marge_dernier + '%' : 'N/A'}
- Fonds propres: ${fmtEuro(enrichment.fonds_propres_dernier)}
${enrichment.finances && enrichment.finances.length > 1 ? `- Évolution CA: ${enrichment.finances.slice(0, 3).map(f => `${f.annee}: ${fmtEuro(f.chiffre_affaires)}`).join(' → ')}` : ''}

## Bénéficiaires effectifs
${enrichment.beneficiaires_effectifs?.slice(0, 3).map(b => `- ${b.prenom ?? ''} ${b.nom ?? ''} (${b.pourcentage_parts ?? '?'}% parts)`).join('\n') || 'Non renseignés'}

${enrichment.rpps ? `## Profil santé (RPPS)
- Profession: ${enrichment.rpps.profession ?? 'inconnue'}
- Mode d'exercice: ${enrichment.rpps.mode_exercice ?? 'inconnu'} (${enrichment.rpps.type_activite_liberale ?? '—'})
- Spécialité: ${enrichment.rpps.savoir_faire ?? 'généraliste'}` : ''}

## Signaux BODACC (${enrichment.bodacc_events?.length ?? 0} événements)
${enrichment.bodacc_events?.slice(0, 5).map(e => `- ${e.date}: ${e.type} — ${e.libelle}`).join('\n') || 'Aucun'}

## Transactions immobilières zone (DVF)
${enrichment.dvf_transactions?.slice(0, 3).map(t => `- ${t.date_mutation}: ${t.nature_mutation} ${t.type_local} ${t.surface_reelle_bati ? t.surface_reelle_bati + 'm²' : ''} — ${fmtEuro(t.valeur_fonciere)} à ${t.commune}`).join('\n') || 'Aucune transaction connue'}

## Instructions
Le score doit privilégier les profils avec :
- Patrimoine professionnel important (CA, fonds propres, BE majoritaire)
- Patrimoine immobilier (transactions DVF dans la zone)
- Signaux de liquidité (cession, levée, sortie)
- Âge cible 40-65 ans

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
