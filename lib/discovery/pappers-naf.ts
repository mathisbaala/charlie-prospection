import {
  searchEntreprises,
  getEntrepriseRepresentants,
} from '@/lib/data-sources/pappers'
import { rawProspectFromPappers, canonicalPersonKey } from '@/lib/prospect-search/engine'
import type { DiscoverySource, DiscoveryParams } from './types'
import type { RawProspect } from '@/lib/prospect-search/engine'

const DEFAULT_LIMIT = 20

async function fetchByNaf(
  naf: string,
  params: DiscoveryParams,
  perNafLimit: number,
): Promise<RawProspect[]> {
  const { resultats } = await searchEntreprises({
    code_naf: naf,
    departement: params.departement,
    par_page: Math.min(perNafLimit + 5, 50),
  })

  if (!resultats.length) return []

  const settled = await Promise.allSettled(
    resultats.slice(0, perNafLimit * 2).map(async (ae) => {
      const reps = await getEntrepriseRepresentants(ae.siren)
      return { ae, reps }
    }),
  )

  const results: RawProspect[] = []
  for (const r of settled) {
    if (results.length >= perNafLimit) break
    if (r.status === 'rejected') continue
    const { ae, reps } = r.value
    const physicals = reps.filter((r) => !r.personne_morale)
    if (!physicals.length) continue
    results.push(rawProspectFromPappers(ae, physicals[0]))
  }

  return results
}

export const pappersNafSource: DiscoverySource = {
  name: 'pappers-naf',

  async discover(params: DiscoveryParams): Promise<RawProspect[]> {
    const codes = params.naf_codes?.length
      ? params.naf_codes
      : params.naf_code
        ? [params.naf_code]
        : []

    if (!codes.length) return []

    const limit = params.limit ?? DEFAULT_LIMIT
    // Spread budget across codes; each code gets at least 5 results
    const perNaf = Math.max(5, Math.ceil(limit / codes.length))

    const settled = await Promise.allSettled(
      codes.map((naf) => fetchByNaf(naf, params, perNaf)),
    )

    const seen = new Set<string>()
    const results: RawProspect[] = []

    for (const r of settled) {
      if (results.length >= limit) break
      if (r.status === 'rejected') continue
      for (const prospect of r.value) {
        if (results.length >= limit) break
        const key = canonicalPersonKey(
          prospect.dirigeant_prenom,
          prospect.dirigeant_nom,
          prospect.siren,
        )
        if (seen.has(key)) continue
        seen.add(key)
        results.push(prospect)
      }
    }

    return results
  },
}
