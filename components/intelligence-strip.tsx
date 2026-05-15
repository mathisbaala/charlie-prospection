import Link from 'next/link'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { InboxEventType } from '@/lib/types'

const WINDOW_DAYS = 7

// Singular / plural French labels for the type_event field, in the order we
// want them to appear in the strip's breakdown.
const TYPE_LABEL_ORDER: Array<{ type: InboxEventType; one: string; many: string }> = [
  { type: 'cession', one: 'cession', many: 'cessions' },
  { type: 'creation', one: 'création', many: 'créations' },
  { type: 'modif_capital', one: 'modification de capital', many: 'modifications de capital' },
  { type: 'modif_beneficiaire', one: 'modification BE', many: 'modifications BE' },
  { type: 'modification', one: 'modification', many: 'modifications' },
  { type: 'radiation', one: 'radiation', many: 'radiations' },
  { type: 'procedure_collective', one: 'procédure collective', many: 'procédures collectives' },
  { type: 'autre', one: 'autre signal', many: 'autres signaux' },
]

interface SignalRow {
  type_event: InboxEventType
}

/**
 * Find the org_id of the currently-signed-in user, or null if none.
 * Uses the regular RLS-aware server client so it only sees the user's own
 * membership row.
 */
async function resolveCurrentOrgId(): Promise<string | null> {
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

  return membership?.org_id ?? null
}

/**
 * Fetch the signals matched to this org within the WINDOW_DAYS window.
 * Reads from the global inbox table — bypasses RLS via service role, but
 * filters server-side on matched_org_ids so we only ever return this org's
 * data.
 */
async function fetchOrgSignals(orgId: string): Promise<SignalRow[]> {
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('prospection_signals_inbox')
    .select('type_event')
    .contains('matched_org_ids', [orgId])
    .gte('date_event', since)
    // Filings of annual accounts are routine and represent ~60% of BODACC
    // volume. They are not actionable for prospecting — hide them from the
    // strip so the total reflects only high-signal events.
    .neq('type_event', 'depot_comptes')
    .limit(200)

  if (error) return []
  return (data ?? []) as SignalRow[]
}

function formatBreakdown(rows: SignalRow[]): { total: number; parts: string[] } {
  const counts = new Map<InboxEventType, number>()
  for (const row of rows) {
    counts.set(row.type_event, (counts.get(row.type_event) ?? 0) + 1)
  }
  const parts: string[] = []
  for (const { type, one, many } of TYPE_LABEL_ORDER) {
    const n = counts.get(type) ?? 0
    if (n === 0) continue
    parts.push(`${n} ${n === 1 ? one : many}`)
  }
  return { total: rows.length, parts }
}

export async function IntelligenceStrip() {
  const orgId = await resolveCurrentOrgId()
  if (!orgId) return null

  const signals = await fetchOrgSignals(orgId)
  if (signals.length === 0) return null

  const { total, parts } = formatBreakdown(signals)
  const headline =
    total === 1
      ? '1 signal qualifié cette semaine selon votre ICP'
      : `${total} signaux qualifiés cette semaine selon votre ICP`

  return (
    <div
      role="status"
      style={{
        background: 'var(--color-accent)',
        color: '#FDFAF5',
        fontSize: '11.5px',
        padding: '8px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        letterSpacing: '0.01em',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
      }}
    >
      <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '6px' }}>
        <strong style={{ fontWeight: 600 }}>{headline}</strong>
        {parts.length > 0 && (
          <span style={{ opacity: 0.85 }}>— {parts.join(', ')}.</span>
        )}
      </span>
      <Link
        href="/pipeline?filter=fresh"
        style={{
          color: '#FDFAF5',
          textDecoration: 'underline',
          textUnderlineOffset: '2px',
          whiteSpace: 'nowrap',
        }}
      >
        Voir les signaux →
      </Link>
    </div>
  )
}
