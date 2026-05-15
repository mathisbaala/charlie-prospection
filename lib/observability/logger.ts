/**
 * Minimal JSON-line logger for external data-source calls.
 * Emits one line per operation: {ts, source, op, status, duration_ms, error?}.
 * No transport, no sampling — just stdout via console.log so it lands in Vercel logs.
 */

export type LogStatus = 'ok' | 'error' | 'http_error'

export interface ExternalCallLog {
  source: string
  op: string
  status: LogStatus
  duration_ms: number
  http_status?: number
  error?: string
}

export function logExternalCall(entry: ExternalCallLog): void {
  const line = {
    ts: new Date().toISOString(),
    ...entry,
  }
  console.log(JSON.stringify(line))
}

/**
 * Time + log a fetch call. The wrapper is intentionally narrow: it only
 * measures wall-clock duration and classifies HTTP/network outcomes.
 * Business logic (parsing, fallbacks) stays in the caller.
 */
export async function timedFetch(
  source: string,
  op: string,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const start = Date.now()
  try {
    const res = await fetch(input, init)
    logExternalCall({
      source,
      op,
      status: res.ok ? 'ok' : 'http_error',
      duration_ms: Date.now() - start,
      http_status: res.status,
    })
    return res
  } catch (err) {
    logExternalCall({
      source,
      op,
      status: 'error',
      duration_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}
