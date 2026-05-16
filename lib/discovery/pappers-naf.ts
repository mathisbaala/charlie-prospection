import {
  searchEntreprises,
  getEntrepriseRepresentants,
} from '@/lib/data-sources/pappers'
import { rawProspectFromPappers } from '@/lib/prospect-search/engine'
import type { DiscoverySource, DiscoveryParams } from './types'
import type { RawProspect } from '@/lib/prospect-search/engine'

const DEFAULT_LIMIT = 20

export const pappersNafSource: DiscoverySource = {
  name: 'pappers-naf',

  async discover(params: DiscoveryParams): Promise<RawProspect[]> {
    if (!params.naf_code) return []

    const limit = params.limit ?? DEFAULT_LIMIT
    const { resultats } = await searchEntreprises({
      code_naf: params.naf_code,
      departement: params.departement,
      par_page: Math.min(limit + 5, 50),
    })

    if (!resultats.length) return []

    const seen = new Set<string>()
    const results: RawProspect[] = []

    const settled = await Promise.allSettled(
      resultats.slice(0, limit * 2).map(async (ae) => {
        const reps = await getEntrepriseRepresentants(ae.siren)
        return { ae, reps }
      }),
    )

    for (const r of settled) {
      if (results.length >= limit) break
      if (r.status === 'rejected') continue
      const { ae, reps } = r.value
      const physicals = reps.filter((r) => !r.personne_morale)
      if (!physicals.length) continue
      const prospect = rawProspectFromPappers(ae, physicals[0])
      if (seen.has(prospect.uid)) continue
      seen.add(prospect.uid)
      results.push(prospect)
    }

    return results
  },
}
