import type { ParsedIcpCriteria } from '@/lib/types'
import type { RunDiscoveryParams } from './index'

// ---------------------------------------------------------------------------
// Location → département code
// ---------------------------------------------------------------------------

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const LOCATION_MAP: Record<string, string> = {
  // Dept codes already
  '01': '01', '02': '02', '03': '03', '04': '04', '05': '05',
  '06': '06', '07': '07', '08': '08', '09': '09',
  '10': '10', '11': '11', '12': '12', '13': '13', '14': '14', '15': '15',
  '16': '16', '17': '17', '18': '18', '19': '19',
  '21': '21', '22': '22', '23': '23', '24': '24', '25': '25', '26': '26',
  '27': '27', '28': '28', '29': '29',
  '30': '30', '31': '31', '32': '32', '33': '33', '34': '34', '35': '35',
  '36': '36', '37': '37', '38': '38', '39': '39',
  '40': '40', '41': '41', '42': '42', '43': '43', '44': '44', '45': '45',
  '46': '46', '47': '47', '48': '48', '49': '49',
  '50': '50', '51': '51', '52': '52', '53': '53', '54': '54', '55': '55',
  '56': '56', '57': '57', '58': '58', '59': '59',
  '60': '60', '61': '61', '62': '62', '63': '63', '64': '64', '65': '65',
  '66': '66', '67': '67', '68': '68', '69': '69',
  '70': '70', '71': '71', '72': '72', '73': '73', '74': '74', '75': '75',
  '76': '76', '77': '77', '78': '78', '79': '79',
  '80': '80', '81': '81', '82': '82', '83': '83', '84': '84', '85': '85',
  '86': '86', '87': '87', '88': '88', '89': '89',
  '90': '90', '91': '91', '92': '92', '93': '93', '94': '94', '95': '95',

  // Major cities → dept
  paris: '75', lyon: '69', marseille: '13', toulouse: '31', nice: '06',
  nantes: '44', montpellier: '34', strasbourg: '67', bordeaux: '33',
  lille: '59', rennes: '35', reims: '51', sainteetienne: '42', toulon: '83',
  grenoble: '38', dijon: '21', angers: '49', nimes: '30', villeurbanne: '69',
  aixenprovence: '13', brest: '29', rouen: '76', havre: '76', lehavre: '76',
  amiens: '80', nancy: '54', metz: '57', caen: '14', clermontferrand: '63',
  limoges: '87', orleans: '45', perpignan: '66', mulhouse: '68', besancon: '25',
  boulognebillancourt: '92', versailles: '78', creteil: '94', argenteuil: '95',
  montreuil: '93', tours: '37', roubaix: '59', tourcoing: '59', vitry: '94',
  avignon: '84', poitiers: '86', aix: '13', bayonne: '64', pau: '64',
  courbevoie: '92', boulogne: '92', colombes: '92', lorient: '56', troyes: '10',
  nanterre: '92', meaux: '77', evry: '91', valence: '26', angouleme: '16',

  // Department names (normalized)
  rhone: '69', bouchesdurhone: '13', hautegaronne: '31', alpesmaritimes: '06',
  loireatlantique: '44', herault: '34', basrhin: '67', gironde: '33', nord: '59',
  illeetvilaine: '35', isere: '38', var: '83', hautesavoie: '74', savoie: '73',
  moselle: '57', moselle57: '57', seineetmarne: '77', yvelines: '78',
  essonne: '91', hautsdeseine: '92', seinesaintdenis: '93', valdmarne: '94',
  valdoise: '95', seineinfereure: '76', seinemaritime: '76', calvados: '14',
  finistere: '29', cotesdarmor: '22', morbihan: '56', maineetloire: '49',
  sarthe: '72', mayenne: '53', indreettloire: '37', loiret: '45',
  eure: '27', loiretcher: '41', loir: '28', indreetloire: '37', cher: '18',
  indre: '36', creuse: '23', hautvienne: '87', correze: '19', dordogne: '24',
  lot: '46', tarn: '81', gers: '32', lotettaronne: '47', tarnettaronne: '82',
  ariege: '09', pyreneesatlantiques: '64', hautespyrenees: '65',
  pyreneesorientales: '66', aude: '11', gard: '30', lozere: '48',
  aveyron: '12', cantal: '15', hauteloire: '43', puydedome: '63',
  allier: '03', saoneetloire: '71', coteor: '21', coteorgold: '21',
  ain: '01', hautealsace: '68', basalsace: '67', hautrhin: '68', hautrhin68: '68',
  doubs: '25', jurasien: '39', jura: '39', hautsaone: '70', belfortterre: '90',
  oise: '60', somme: '80', aisne: '02', marne: '51', hautmarne: '52',
  ardenneardenne: '08', ardenne: '08', meuse: '55', meurtheetmoselle: '54',
  vosges: '88', basrhin67: '67',

  // Regions → main dept
  iledefrance: '75', idf: '75', paca: '13', provencealpes: '13',
  auvergnerhonesalpes: '69', ara: '69', nouvellacquitaine: '33',
  occitanie: '31', grandest: '67', hautsdefrance: '59', bretagne: '35',
  paysdeloire: '44', normandie: '76', bourgognefranchecomte: '21',
  centrevaldeloire: '45', parisregion: '75',
}

export function locationsToDept(locations: string[]): string | undefined {
  for (const loc of locations) {
    const key = norm(loc)
    if (LOCATION_MAP[key]) return LOCATION_MAP[key]
    // Try matching on partial (e.g. "Métropole de Lyon" → "lyon" → "69")
    for (const [k, v] of Object.entries(LOCATION_MAP)) {
      if (key.includes(k) || k.includes(key)) return v
    }
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Roles / sectors → RPPS profession filter
// ---------------------------------------------------------------------------

const MEDECIN_KW = [
  'medecin', 'medico', 'generaliste', 'dermatologue', 'cardiologue',
  'radiologue', 'specialiste', 'praticien', 'pneumologue', 'gastro',
  'rhumatologue', 'ophtalmologue', 'neurologue', 'psychiatre', 'pediatre',
  'gynecologue', 'oncologue', 'endocrinologue', 'nephrologue', 'hematologue',
  'anesthesiste', 'reanimateur', 'urgentiste', 'omnipraticien', 'libsante',
]
const DENTISTE_KW = [
  'dentiste', 'chirurgiendentiste', 'orthodontiste', 'parodontiste',
  'implantologue', 'stomatologue', 'dentaire',
]
const PHARMACIEN_KW = [
  'pharmacien', 'pharmacie', 'officine', 'pharmacist',
]
const KINE_KW = [
  'kinesitherapeute', 'kinesitherapi', 'kine', 'physiotherapeute',
  'masseurkinesitherapeute', 'masso',
]
const SAGE_FEMME_KW = [
  'sagefemme', 'sage-femme', 'maternite', 'obstetrique', 'accouchement',
]

export function inferRppsProfession(
  roles: string[],
  sectors: string[],
): 'Medecin' | 'Chirurgien-Dentiste' | 'Pharmacien' | 'Kinesitherapeute' | 'Sage-Femme' | undefined {
  const all = [...roles, ...sectors].map(norm).join(' ')
  if (DENTISTE_KW.some((kw) => all.includes(kw))) return 'Chirurgien-Dentiste'
  if (PHARMACIEN_KW.some((kw) => all.includes(kw))) return 'Pharmacien'
  if (KINE_KW.some((kw) => all.includes(kw))) return 'Kinesitherapeute'
  if (SAGE_FEMME_KW.some((kw) => all.includes(kw))) return 'Sage-Femme'
  if (MEDECIN_KW.some((kw) => all.includes(kw))) return 'Medecin'
  return undefined
}

// ---------------------------------------------------------------------------
// Roles / sectors → NAF code (best-effort)
// ---------------------------------------------------------------------------

const SECTOR_TO_NAF: Array<{ keywords: string[]; naf: string }> = [
  { keywords: ['medecingeneraliste', 'omnipraticien', 'generalist'], naf: '86.21Z' },
  { keywords: ['medecinspecialiste', 'specialiste', 'medecin'], naf: '86.22Z' },
  { keywords: ['chirurgiendentiste', 'dentiste', 'dentaire', 'orthodontiste'], naf: '86.23Z' },
  { keywords: ['kinesitherapeute', 'kine', 'physiotherapeute', 'masso'], naf: '86.90A' },
  { keywords: ['sagefemme', 'sage-femme', 'maternite', 'accouchement'], naf: '86.90B' },
  { keywords: ['pharmacie', 'pharmacien', 'officine'], naf: '47.73Z' },
  { keywords: ['optique', 'opticien', 'luneterie'], naf: '47.78A' },
  { keywords: ['avocat', 'juridique', 'droit', 'barreau'], naf: '69.10Z' },
  { keywords: ['notaire'], naf: '69.10Z' },
  { keywords: ['expertise', 'comptable', 'comptabilite', 'commissaire'], naf: '69.20Z' },
  { keywords: ['architecte', 'architecture', 'maitredoeuvre'], naf: '71.11Z' },
  { keywords: ['veterinaire', 'cliniqueveterinaire'], naf: '75.00Z' },
  { keywords: ['geometre', 'topographe', 'foncier'], naf: '71.12B' },
  { keywords: ['conseil', 'consultant', 'management', 'strategie'], naf: '70.22Z' },
  { keywords: ['ingenieur', 'bureau', 'etudes', 'technique'], naf: '71.12B' },
  { keywords: ['immobilier', 'agenceimmo', 'promoteur', 'marchand', 'foncier'], naf: '68.10Z' },
  { keywords: ['construction', 'btp', 'batiment', 'travaux'], naf: '41.20A' },
  { keywords: ['restauration', 'restaurant', 'hotellerie', 'hotel'], naf: '56.10A' },
  { keywords: ['chirurgien', 'neurochirurgie', 'orthopediste', 'urologie'], naf: '86.10Z' },
]

export function inferNafCode(roles: string[], sectors: string[]): string | undefined {
  return inferNafCodes(roles, sectors)[0]
}

export function inferNafCodes(roles: string[], sectors: string[]): string[] {
  const all = [...roles, ...sectors].map(norm).join(' ')
  const seen = new Set<string>()
  const codes: string[] = []
  for (const { keywords, naf } of SECTOR_TO_NAF) {
    if (!seen.has(naf) && keywords.some((kw) => all.includes(kw))) {
      seen.add(naf)
      codes.push(naf)
    }
  }
  return codes
}

// ---------------------------------------------------------------------------
// Main inference function
// ---------------------------------------------------------------------------

export function inferDiscoveryParams(criteria: ParsedIcpCriteria): RunDiscoveryParams {
  const dept = locationsToDept(criteria.locations ?? [])
  const profession = inferRppsProfession(criteria.roles ?? [], criteria.sectors ?? [])
  const naf_codes = inferNafCodes(criteria.roles ?? [], criteria.sectors ?? [])

  return {
    departement: dept,
    profession,
    naf_code: naf_codes[0],
    naf_codes: naf_codes.length > 0 ? naf_codes : undefined,
    // 6 months lookback — cession liquidity windows stay open several months
    date_depuis: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  }
}
