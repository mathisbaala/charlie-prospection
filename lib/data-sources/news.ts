import { timedFetch } from '@/lib/observability/logger'

// Presse économique — mentions dans la presse
//
// Source : NewsAPI (newsapi.org)
// Env   : NEWS_API_KEY (requis — ~$50/mois pour 100k requêtes)
// Dégrade gracieusement à [] si la clé est absente.
//
// Signal CGP :
//   - Levée de fonds mentionnée → liquidité future probable
//   - Cession mentionnée → timing appointment
//   - Récompense, interview, nomination → prospect visible et actif
//   - Présence presse régionale → ancrage territorial fort
//
// Sources ciblées : Les Echos, BFM Business, Capital, Challenges, La Tribune,
//   Le Figaro, Le Parisien + presse régionale FR.

const NEWSAPI_BASE = 'https://newsapi.org/v2/everything'
const FR_DOMAINS =
  'lesechos.fr,bfmtv.com,capital.fr,challenges.fr,latribune.fr,lefigaro.fr,' +
  'leparisien.fr,liberation.fr,20minutes.fr,lopinion.fr,usinenouvelle.com,' +
  'maddyness.com,journaldunet.com,lsa-conso.fr,lentreprise.lexpress.fr'

export interface MentionPresse {
  date: string
  titre: string
  source: string
  url: string
  extrait?: string
}

interface NewsApiArticle {
  publishedAt?: string
  title?: string
  source?: { name?: string }
  url?: string
  description?: string
}

export async function getMentionsPresse(
  nom: string,
  prenom: string,
  entrepriseNom?: string,
): Promise<MentionPresse[]> {
  const key = process.env.NEWS_API_KEY
  if (!key) return []

  // Combine person name + company name for precision
  const query = entrepriseNom
    ? `"${prenom} ${nom}" OR "${entrepriseNom}"`
    : `"${prenom} ${nom}"`

  try {
    const params = new URLSearchParams({
      q: query,
      language: 'fr',
      sortBy: 'publishedAt',
      pageSize: '10',
      domains: FR_DOMAINS,
      apiKey: key,
    })
    const url = `${NEWSAPI_BASE}?${params.toString()}`

    const res = await timedFetch('newsapi', 'getMentionsPresse', url, {
      next: { revalidate: 3600 * 6 }, // refresh 2×/jour
    })
    if (!res.ok) return []

    const data = (await res.json()) as { articles?: NewsApiArticle[] }
    return (data.articles ?? []).map((a): MentionPresse => ({
      date: a.publishedAt ?? '',
      titre: a.title ?? '',
      source: a.source?.name ?? '',
      url: a.url ?? '',
      extrait: a.description ?? undefined,
    }))
  } catch {
    return []
  }
}
