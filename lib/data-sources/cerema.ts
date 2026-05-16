import { timedFetch } from '@/lib/observability/logger'
import type { CeremaHolding } from '@/lib/types'

const BASE = 'https://apidf.cerema.fr/api/ff'

export interface CeremaMutationRaw {
  idmutation: string
  datemut: string           // "YYYY-MM-DD"
  valeurfonc: number
  sbati?: number
  l_idpar?: string[]        // identifiants parcelle(s)
  l_adresse?: string[]      // adresse(s) concernées
  libtypbien?: string       // "Appartement", "Maison", "Local industriel"...
  siren_acheteur1?: string
  siren_vendeur1?: string
}

interface MutationsPage {
  count: number
  next: string | null
  results: CeremaMutationRaw[]
}

export async function fetchMutationsBySiren(
  siren: string,
  token: string,
): Promise<CeremaMutationRaw[]> {
  const headers = { Authorization: `Bearer ${token}` }

  const [buyerRes, sellerRes] = await Promise.allSettled([
    timedFetch('cerema', 'fetchBuyer',
      `${BASE}/mutations/?siren_acheteur1=${siren}&ordering=-datemut&page_size=50`,
      { headers }),
    timedFetch('cerema', 'fetchSeller',
      `${BASE}/mutations/?siren_vendeur1=${siren}&ordering=-datemut&page_size=50`,
      { headers }),
  ])

  const results: CeremaMutationRaw[] = []
  const seen = new Set<string>()

  if (buyerRes.status === 'fulfilled' && buyerRes.value.ok) {
    const data: MutationsPage = await buyerRes.value.json()
    for (const r of data.results ?? []) {
      seen.add(r.idmutation)
      results.push({ ...r, siren_acheteur1: siren })
    }
  }

  if (sellerRes.status === 'fulfilled' && sellerRes.value.ok) {
    const data: MutationsPage = await sellerRes.value.json()
    for (const r of data.results ?? []) {
      if (!seen.has(r.idmutation)) {
        results.push({ ...r, siren_vendeur1: siren })
      }
    }
  }

  return results
}

function normalizeAddr(s: string | undefined): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function inferHoldings(
  mutations: CeremaMutationRaw[],
  siren: string,
  entiteNom: string,
): CeremaHolding[] {
  if (mutations.length === 0) return []

  const buys = mutations.filter(m => m.siren_acheteur1 === siren)
  const sells = mutations.filter(m => m.siren_vendeur1 === siren)

  const soldKeys = new Set<string>()
  for (const s of sells) {
    for (const p of s.l_idpar ?? []) soldKeys.add(p)
    const addr = normalizeAddr(s.l_adresse?.[0])
    if (addr && (s.l_idpar ?? []).length === 0) soldKeys.add(addr)
  }

  const now = new Date()
  const holdings: CeremaHolding[] = []

  for (const buy of buys) {
    const adresse = buy.l_adresse?.[0] ?? ''
    const id_parcelle = buy.l_idpar?.[0]
    const lookupKey = id_parcelle ?? normalizeAddr(adresse)
    const isSold = lookupKey ? soldKeys.has(lookupKey) : false

    const ageYears =
      (now.getTime() - new Date(buy.datemut).getTime()) / (1000 * 60 * 60 * 24 * 365)

    let confidence: 'high' | 'medium' | 'low'
    if (id_parcelle && !isSold && ageYears < 5) confidence = 'high'
    else if (id_parcelle && !isSold) confidence = 'medium'
    else confidence = 'low'

    holdings.push({
      siren,
      entite_nom: entiteNom,
      adresse,
      type_local: buy.libtypbien,
      surface_bati: buy.sbati,
      date_achat: buy.datemut,
      prix_achat: buy.valeurfonc,
      id_parcelle,
      confidence,
      statut: isSold ? 'vendu' : 'detenu',
    })
  }

  return holdings.sort((a, b) => b.date_achat.localeCompare(a.date_achat))
}
