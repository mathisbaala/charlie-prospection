import Link from 'next/link'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

const WINDOW_DAYS = 7

const TYPE_LABELS: Array<{ types: string[]; one: string; many: string }> = [
  { types: ['cession', 'cession_entreprise'], one: 'cession', many: 'cessions' },
  { types: ['creation', 'installation_cabinet'], one: 'création', many: 'créations' },
  { types: ['modif_capital', 'augmentation_capital'], one: 'modif. capital', many: 'modifs capital' },
  { types: ['modif_beneficiaire', 'creation_holding'], one: 'modif. BE', many: 'modifs BE' },
  { types: ['procedure_collective'], one: 'procédure collective', many: 'procédures collectives' },
  { types: ['radiation'], one: 'radiation', many: 'radiations' },
  { types: ['modification', 'nouveau_poste'], one: 'modification', many: 'modifications' },
]

interface PerPersona {
  personaId: string
  personaName: string
  total: number
  parts: string[]
}

/**
 * V2 IntelligenceStrip — reads from prospection_signals (per-prospect, SIREN-
 * matched) instead of prospection_signals_inbox.matched_org_ids (org-wide,
 * NAF+dept-matched). Grouped by persona for clearer signal attribution.
 *
 * Shows one row per persona with at least one fresh signal in WINDOW_DAYS.
 * Excludes 'depot_comptes' as routine noise.
 */
export async function IntelligenceStripV2() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: membership } = await supabase
    .from('prospection_organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return null
  const orgId = membership.org_id

  // Service role: prospection_signals has RLS, but we already verified org
  // membership and we want a single fast query joining to icps + prospects.
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // This is an async server component — `Date.now()` runs once per request,
  // not on every render. The react-hooks/purity rule is intended for client
  // components and fires a false positive here.
  // eslint-disable-next-line react-hooks/purity
  const sinceMs = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000
  const since = new Date(sinceMs).toISOString()

  const { data: rows, error } = await service
    .from('prospection_signals')
    .select(
      `type, prospection_prospects!inner(icp_id, prospection_icps!inner(id, name))`,
    )
    .eq('org_id', orgId)
    .gte('detected_at', since)
    .neq('type', 'depot_comptes')
    .limit(500)

  // Empty state: only show it when the org has at least one prospect in suivi
  // (otherwise it's just a normal "haven't started yet" state, no value to
  // surface). Below we check prospect count to disambiguate.
  if (error || !rows || rows.length === 0) {
    const { count: trackedCount } = await service
      .from('prospection_prospects')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .not('icp_id', 'is', null)

    if (!trackedCount || trackedCount === 0) return null

    return (
      <div
        role="status"
        style={{
          background: 'var(--color-surface)',
          color: 'var(--color-muted)',
          fontSize: 11.5,
          padding: '8px 24px',
          letterSpacing: '0.01em',
          borderBottom: '1px solid var(--color-border)',
          textAlign: 'center',
        }}
      >
        Aucun signal qualifié sur les {WINDOW_DAYS} derniers jours. Les nouveaux signaux
        s&apos;affichent ici après le passage du firehose quotidien (06:30 UTC).
      </div>
    )
  }

  // Group: personaId → { name, types[] }
  const groups = new Map<string, { name: string; counts: Map<string, number> }>()
  for (const r of rows as unknown as Array<{
    type: string
    prospection_prospects: {
      icp_id: string | null
      prospection_icps: { id: string; name: string } | null
    } | null
  }>) {
    const persona = r.prospection_prospects?.prospection_icps
    if (!persona) continue
    const g = groups.get(persona.id) ?? { name: persona.name, counts: new Map() }
    g.counts.set(r.type, (g.counts.get(r.type) ?? 0) + 1)
    groups.set(persona.id, g)
  }

  if (groups.size === 0) return null

  const summaries: PerPersona[] = []
  for (const [personaId, g] of groups.entries()) {
    let total = 0
    g.counts.forEach((c) => (total += c))
    const parts: string[] = []
    for (const { types, one, many } of TYPE_LABELS) {
      let n = 0
      for (const t of types) n += g.counts.get(t) ?? 0
      if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`)
    }
    summaries.push({ personaId, personaName: g.name, total, parts })
  }
  summaries.sort((a, b) => b.total - a.total)

  return (
    <div
      role="status"
      style={{
        background: 'var(--color-accent)',
        color: '#FDFAF5',
        fontSize: 11.5,
        padding: '8px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        letterSpacing: '0.01em',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
      }}
    >
      {summaries.map((s) => (
        <div
          key={s.personaId}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>
            <strong style={{ fontWeight: 600 }}>{s.personaName}</strong>
            <span style={{ opacity: 0.9 }}>
              · {s.total} signal{s.total > 1 ? 's' : ''} qualifié{s.total > 1 ? 's' : ''} cette semaine
            </span>
            {s.parts.length > 0 && <span style={{ opacity: 0.85 }}>— {s.parts.join(', ')}.</span>}
          </span>
          <Link
            href={`/suivi?persona=${s.personaId}`}
            style={{
              color: '#FDFAF5',
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
              whiteSpace: 'nowrap',
            }}
          >
            Voir →
          </Link>
        </div>
      ))}
    </div>
  )
}
