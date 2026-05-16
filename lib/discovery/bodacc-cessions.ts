import { timedFetch } from '@/lib/observability/logger'
import {
  extractSirenFromRegistre,
  classifyBodaccEvent,
  type BodaccRecord,
} from '@/lib/data-sources/bodacc'
import {
  searchEntreprises,
  getEntrepriseRepresentants,
} from '@/lib/data-sources/pappers'
import { rawProspectFromPappers } from '@/lib/prospect-search/engine'
import type { DiscoverySource, DiscoveryParams } from './types'
import type { RawProspect } from '@/lib/prospect-search/engine'

const BODACC_BASE =
  'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records'

const DEFAULT_LIMIT = 20

async function fetchRecentAnnouncements(
  dateSince: string,
  departement?: string,
  limit = 60,
): Promise<BodaccRecord[]> {
  let where = `dateparution >= date'${dateSince}'`
  if (departement) {
    where += ` AND numerodepartement:"${departement}"`
  }
  const url = `${BODACC_BASE}?where=${encodeURIComponent(where)}&limit=${limit}&order_by=dateparution%20desc`

  try {
    const res = await timedFetch('bodacc', 'fetchCessionsDiscovery', url, {
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = (await res.json()) as { results?: BodaccRecord[] }
    return data.results ?? []
  } catch {
    return []
  }
}

export const bodaccCessionsSource: DiscoverySource = {
  name: 'bodacc-cessions',

  async discover(params: DiscoveryParams): Promise<RawProspect[]> {
    const limit = params.limit ?? DEFAULT_LIMIT

    const dateSince =
      params.date_depuis ??
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const records = await fetchRecentAnnouncements(dateSince, params.departement, limit * 3)

    const cessions = records.filter((r) => classifyBodaccEvent(r) === 'cession')

    const seen = new Set<string>()
    const results: RawProspect[] = []

    const settled = await Promise.allSettled(
      cessions.slice(0, limit * 2).map(async (record) => {
        const siren = extractSirenFromRegistre(record.registre)
        if (!siren) return null

        const [{ resultats }, reps] = await Promise.all([
          searchEntreprises({ q: siren, par_page: 1 }),
          getEntrepriseRepresentants(siren),
        ])

        const ae = resultats[0]
        const physicals = reps.filter((r) => !r.personne_morale)
        if (!ae || !physicals.length) return null

        return rawProspectFromPappers(ae, physicals[0], 'bodacc_cessions')
      }),
    )

    for (const r of settled) {
      if (results.length >= limit) break
      if (r.status === 'rejected' || !r.value) continue
      const prospect = r.value
      if (seen.has(prospect.uid)) continue
      seen.add(prospect.uid)
      results.push(prospect)
    }

    return results
  },
}
