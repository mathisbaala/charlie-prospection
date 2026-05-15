import type { ActivityKind } from '@/lib/types'

/** Source of truth for valid ActivityKind values. Used by the API route
 *  and by client UI when building the picker. */
export const ALLOWED_ACTIVITY_KINDS: readonly ActivityKind[] = [
  'note',
  'call',
  'email_sent',
  'linkedin_message',
  'meeting',
  'other',
] as const

export function isValidActivityKind(value: unknown): value is ActivityKind {
  return typeof value === 'string' && ALLOWED_ACTIVITY_KINDS.includes(value as ActivityKind)
}

/** Body validation for POST /api/prospects/[id]/activity.
 *  Returns the parsed input or an error string. */
export function parseActivityInput(raw: unknown): {
  ok: true
  kind: ActivityKind
  body: string
  occurredAt?: string
} | {
  ok: false
  error: string
} {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'payload manquant' }
  }
  const obj = raw as Record<string, unknown>
  const kind = obj.kind
  if (!isValidActivityKind(kind)) {
    return { ok: false, error: 'kind invalide' }
  }
  const body = typeof obj.body === 'string' ? obj.body.trim() : ''
  if (!body) {
    return { ok: false, error: 'body requis' }
  }
  const occurredAt = typeof obj.occurred_at === 'string' ? obj.occurred_at : undefined
  return { ok: true, kind, body, occurredAt }
}
