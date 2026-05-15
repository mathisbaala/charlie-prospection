export interface PreviewCard {
  score: number
  city: string
  naf: string
  signals: string[]
}

export interface Preview {
  count: number
  cards: PreviewCard[]
}

const CITIES = [
  'Lyon 6e', 'Bordeaux', 'Paris 16e', 'Marseille 8e', 'Toulouse',
  'Nantes', 'Strasbourg', 'Lille', 'Nice', 'Rennes',
  'Aix-en-Provence', 'Annecy', 'Versailles', 'La Rochelle', 'Biarritz',
] as const

const NAF_CODES = [
  '8622A', '8622B', '6920Z', '4719A', '4711F',
  '7022Z', '6831Z', '6201Z', '7112B', '8559A',
] as const

const SIGNAL_TEMPLATES: Array<(rng: () => number) => string> = [
  rng => `PATRIMOINE ${(2 + rng() * 8).toFixed(1)}M€`,
  () => 'VENTE BODACC',
  () => 'CESSION RÉCENTE',
  rng => `${Math.floor(50 + rng() * 25)} ANS`,
  () => 'TRANSMISSION PRÉVUE',
  () => 'LIQUIDITÉS DISPO',
]

function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]
}

export function generatePreview(query: string): Preview {
  const seed = cyrb53(query || 'default')
  const rng = makeRng(seed)

  const count = 50 + Math.floor(rng() * 200)

  const cards: PreviewCard[] = Array.from({ length: 4 }, () => {
    const score = 65 + Math.floor(rng() * 31)
    const city = pick(CITIES, rng)
    const naf = pick(NAF_CODES, rng)

    const signals: string[] = []
    const usedTemplateIdx = new Set<number>()
    while (signals.length < 2) {
      const idx = Math.floor(rng() * SIGNAL_TEMPLATES.length)
      if (usedTemplateIdx.has(idx)) continue
      usedTemplateIdx.add(idx)
      signals.push(SIGNAL_TEMPLATES[idx](rng))
    }

    return { score, city, naf, signals }
  })

  return { count, cards }
}
