import { timedFetch } from '@/lib/observability/logger'

// BALO — Bulletin des Annonces Légales Obligatoires (dividendes distribués)
//
// Source : API PISTE (Direction de l'information légale et administrative — DILA)
// Env    : PISTE_CLIENT_ID + PISTE_CLIENT_SECRET (inscription gratuite sur piste.gouv.fr)
// OAuth2 : token Bearer à rafraîchir (TTL 3600s)
//
// Signal CGP :
//   - Société qui a distribué 500k€ de dividendes = liquidités probables chez le dirigeant
//   - Mise en paiement de dividendes récente → fenêtre d'opportunité courte
//
// Scope : principalement sociétés cotées / ayant +100 actionnaires. Pour les PME
// privées, les dividendes sont dans la liasse fiscale (Pappers Premium).

const isSandbox = process.env.PISTE_SANDBOX === '1'
const PISTE_TOKEN_URL = isSandbox
  ? 'https://sandbox-oauth.piste.gouv.fr/api/oauth/token'
  : 'https://oauth.piste.gouv.fr/api/oauth/token'
const PISTE_SEARCH_URL = isSandbox
  ? 'https://sandbox-api.piste.gouv.fr/dila/legifrance/lf-engine-app/search'
  : 'https://api.piste.gouv.fr/dila/legifrance/lf-engine-app/search'

export interface DividendeBalo {
  date_publication: string
  entreprise: string
  montant_par_action?: number
  date_mise_en_paiement?: string
  resume?: string
}

let _cachedToken: { token: string; expires_at: number } | null = null

async function getPisteToken(): Promise<string | null> {
  const clientId = process.env.PISTE_CLIENT_ID
  const clientSecret = process.env.PISTE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  if (_cachedToken && Date.now() < _cachedToken.expires_at) {
    return _cachedToken.token
  }

  try {
    const res = await fetch(PISTE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'openid',
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { access_token?: string; expires_in?: number }
    if (!data.access_token) return null
    _cachedToken = {
      token: data.access_token,
      expires_at: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
    }
    return _cachedToken.token
  } catch {
    return null
  }
}

export async function getDividendesBalo(
  nom: string,
  entrepriseNom?: string,
): Promise<DividendeBalo[]> {
  const token = await getPisteToken()
  if (!token) return []

  const query = entrepriseNom ? `"${entrepriseNom}"` : `"${nom}"`

  try {
    const res = await timedFetch('balo', 'getDividendesBalo', PISTE_SEARCH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        fond: 'BALO',
        recherche: {
          champs: [
            {
              typeChamp: 'ALL',
              criteres: [{ typeRecherche: 'EXACTE', valeur: query, proximite: 2 }],
              operateur: 'ET',
            },
          ],
          filtres: [],
          pageNumber: 1,
          pageSize: 10,
          operateur: 'ET',
          sort: 'PERTINENCE',
          typePagination: 'DEFAUT',
        },
      }),
    })
    if (!res.ok) return []

    const data = (await res.json()) as {
      results?: Array<{
        titles?: Array<{ title?: string }>
        titre?: string
        datePublication?: string
        dateParution?: string
        resumePrincipal?: Array<{ valeur?: string }>
        texteIntegral?: string
      }>
    }

    return (data.results ?? []).map((r): DividendeBalo => ({
      date_publication: r.datePublication ?? r.dateParution ?? '',
      entreprise: r.titles?.[0]?.title ?? r.titre ?? entrepriseNom ?? nom,
      resume: r.resumePrincipal?.[0]?.valeur?.slice(0, 300) ?? r.texteIntegral?.slice(0, 300),
    }))
  } catch {
    return []
  }
}
