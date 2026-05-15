import Anthropic from '@anthropic-ai/sdk'
import type {
  BodaccEvent,
  PatrimonyScoreBreakdown,
  PatrimonyScoreResult,
  ProspectEnrichmentData,
} from '@/lib/types'

function fmtEuro(n?: number): string {
  if (n == null) return 'N/A'
  return n.toLocaleString('fr-FR') + '€'
}

/**
 * Weight a signal by recency. Fresh signals (a cession from last week) carry
 * a different patrimony implication than stale ones (a cession from 8 months
 * ago — the founder may already be re-engaged elsewhere).
 *   <30j  → 1.0   <90j → 0.7   <180j → 0.4   else → 0.1
 */
export function freshnessWeight(dateIso: string, now: Date = new Date()): number {
  const t = Date.parse(dateIso)
  if (Number.isNaN(t)) return 0.1
  const days = (now.getTime() - t) / (1000 * 60 * 60 * 24)
  if (days < 30) return 1.0
  if (days < 90) return 0.7
  if (days < 180) return 0.4
  return 0.1
}

interface WeightedSignal {
  event: BodaccEvent
  weight: number
}

function weightedSortedSignals(
  events: BodaccEvent[] | undefined,
  now: Date = new Date(),
): WeightedSignal[] {
  if (!events?.length) return []
  return events
    .map(e => ({ event: e, weight: freshnessWeight(e.date, now) }))
    .sort((a, b) => b.weight - a.weight)
}

const RPPS_HINT: Record<NonNullable<ProspectEnrichmentData['potentiel_rpps']>, string> = {
  faible: 'Salarié — potentiel patrimonial limité',
  moyen: 'Libéral généraliste secteur 1 — potentiel modéré',
  fort: 'Libéral technique secteur 1 — potentiel élevé',
  tres_fort: 'Libéral secteur 2/3 plateau technique — potentiel très élevé (revenus typiquement 250k+ €/an)',
}

const SCORING_PROMPT = (enrichment: ProspectEnrichmentData) => {
  const weighted = weightedSortedSignals(enrichment.bodacc_events)
  const signalsBlock = weighted.length
    ? weighted
        .slice(0, 5)
        .map(w => `- [poids ${w.weight.toFixed(1)}] ${w.event.date}: ${w.event.type} — ${w.event.libelle}`)
        .join('\n')
    : 'Aucun'

  const ctxImmo = enrichment.contexte_marche_immo_local
  const contexteImmoBlock = ctxImmo
    ? `## Contexte marché immobilier local (informatif — NE PAS confondre avec patrimoine perso)
- Médiane des transactions zone ${ctxImmo.ville}: ${fmtEuro(ctxImmo.mediane_zone)} (${ctxImmo.nb_transactions_zone} ventes > 300k€)
- Utilise uniquement comme indicateur du niveau de la zone, pas comme patrimoine du dirigeant.`
    : ''

  const rppsBlock = enrichment.rpps
    ? `## Profil santé (RPPS)
- Profession: ${enrichment.rpps.profession ?? 'inconnue'}
- Mode d'exercice: ${enrichment.rpps.mode_exercice ?? 'inconnu'} (${enrichment.rpps.type_activite_liberale ?? '—'})
- Spécialité: ${enrichment.rpps.savoir_faire ?? 'généraliste'}
- Potentiel patrimonial RPPS (input dur): **${enrichment.potentiel_rpps ?? 'inconnu'}** — ${enrichment.potentiel_rpps ? RPPS_HINT[enrichment.potentiel_rpps] : 'pas de profil santé'}`
    : ''

  return `Tu es expert en gestion de patrimoine (CGP) en France.

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

${rppsBlock}

## Signaux BODACC (${enrichment.bodacc_events?.length ?? 0} événements — triés par fraîcheur)
${signalsBlock}

${contexteImmoBlock}

## Instructions
Le score doit privilégier les profils avec :
- Patrimoine professionnel important (CA, fonds propres, BE majoritaire)
- Signaux de liquidité récents (cession, levée, sortie) — pondérés par fraîcheur
- Potentiel RPPS élevé pour les profils santé
- Âge cible 40-65 ans

Le patrimoine_immobilier doit être inféré à partir d'indices (capital social élevé, holding patrimoniale, BE majoritaire, âge, revenus inférés)
— PAS à partir de la médiane de zone DVF. La zone DVF est un contexte, pas le patrimoine du dirigeant.

Réponds UNIQUEMENT en JSON valide, sans markdown:
{
  "score": <0-100>,
  "breakdown": {
    "patrimoine_professionnel": <0-100>,
    "patrimoine_immobilier": <0-100>,
    "signaux_liquidite": <0-100>,
    "age_carriere": <0-100>,
    "qualite_donnees": <0-100>
  },
  "facteurs_cles": ["<phrase courte>", "<phrase courte>", "<phrase courte>"],
  "patrimoine_total_estime": <montant en euros ou null>,
  "valeur_entreprise_estimee": <montant en euros ou null>,
  "revenus_implicites_estimes": <montant annuel en euros ou null>,
  "niveau": <"faible" | "moyen" | "fort" | "prioritaire">,
  "raison_principale": "<1 phrase expliquant le score>"
}`
}

function clamp100(n: unknown, fallback = 0): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(100, Math.max(0, v))
}

function safeNumberOrNull(n: unknown): number | null {
  const v = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(v) ? v : null
}

function emptyBreakdown(): PatrimonyScoreBreakdown {
  return {
    patrimoine_professionnel: 0,
    patrimoine_immobilier: 0,
    signaux_liquidite: 0,
    age_carriere: 0,
    qualite_donnees: 0,
  }
}

function fallbackResult(score = 30, raison = 'Données insuffisantes pour scoring précis'): PatrimonyScoreResult {
  return {
    score,
    breakdown: emptyBreakdown(),
    facteurs_cles: [],
    patrimoine_total_estime: null,
    valeur_entreprise_estimee: null,
    revenus_implicites_estimes: null,
    niveau: 'moyen',
    raison_principale: raison,
  }
}

export async function scorePatrimony(
  enrichment: ProspectEnrichmentData,
): Promise<PatrimonyScoreResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  let text = '{}'
  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 768,
      messages: [{ role: 'user', content: SCORING_PROMPT(enrichment) }],
    })
    text = message.content[0]?.type === 'text' ? message.content[0].text : '{}'
  } catch {
    return fallbackResult()
  }

  try {
    const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    const result = JSON.parse(cleaned)
    const breakdownRaw = result.breakdown ?? {}
    const breakdown: PatrimonyScoreBreakdown = {
      patrimoine_professionnel: clamp100(breakdownRaw.patrimoine_professionnel),
      patrimoine_immobilier: clamp100(breakdownRaw.patrimoine_immobilier),
      signaux_liquidite: clamp100(breakdownRaw.signaux_liquidite),
      age_carriere: clamp100(breakdownRaw.age_carriere),
      qualite_donnees: clamp100(breakdownRaw.qualite_donnees),
    }
    const facteurs = Array.isArray(result.facteurs_cles)
      ? result.facteurs_cles.filter((s: unknown) => typeof s === 'string').slice(0, 5)
      : []

    return {
      score: clamp100(result.score, 30),
      breakdown,
      facteurs_cles: facteurs,
      patrimoine_total_estime: safeNumberOrNull(result.patrimoine_total_estime),
      valeur_entreprise_estimee: safeNumberOrNull(result.valeur_entreprise_estimee),
      revenus_implicites_estimes: safeNumberOrNull(result.revenus_implicites_estimes),
      niveau: ['faible', 'moyen', 'fort', 'prioritaire'].includes(result.niveau)
        ? result.niveau
        : 'moyen',
      raison_principale: typeof result.raison_principale === 'string' ? result.raison_principale : '',
    }
  } catch {
    return fallbackResult()
  }
}
