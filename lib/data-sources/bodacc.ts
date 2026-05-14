const BASE = 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records'

export interface BodaccRecord {
  id: string
  dateparution: string
  typeavis_lib?: string
  familleavis_lib?: string
  commercant?: string
  ville?: string
  cp?: string
  registre?: string
}

export async function getBodaccBySiren(siren: string, limit = 10): Promise<BodaccRecord[]> {
  const where = `registre_rc_cs like "${siren}"`
  const url = `${BASE}?where=${encodeURIComponent(where)}&limit=${limit}&order_by=dateparution%20desc`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const data = await res.json()
    return data.results ?? []
  } catch {
    return []
  }
}

export async function getBodaccByName(nom: string, limit = 5): Promise<BodaccRecord[]> {
  const where = `commercant like "${nom.toUpperCase()}"`
  const url = `${BASE}?where=${encodeURIComponent(where)}&limit=${limit}&order_by=dateparution%20desc`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const data = await res.json()
    return data.results ?? []
  } catch {
    return []
  }
}

export function classifyBodaccEvent(record: BodaccRecord): 'cession' | 'creation' | 'radiation' | 'modification' | 'procedure_collective' | 'autre' {
  const lib = (record.familleavis_lib ?? record.typeavis_lib ?? '').toLowerCase()
  if (lib.includes('cession') || lib.includes('vente')) return 'cession'
  if (lib.includes('création') || lib.includes('immatriculation')) return 'creation'
  if (lib.includes('radiation') || lib.includes('dissolution')) return 'radiation'
  if (lib.includes('redressement') || lib.includes('liquidation') || lib.includes('sauvegarde')) return 'procedure_collective'
  if (lib.includes('modification')) return 'modification'
  return 'autre'
}
