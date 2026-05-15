import { describe, it, expect, afterEach, vi } from 'vitest'

// api-quota.ts checks NODE_ENV === 'test' and short-circuits to allow all
// calls (so unrelated test runs don't need a real Supabase). These tests
// verify that fail-open behaviour + the env-driven cap config.

describe('api-quota — test environment behaviour', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('returns true (fail-open) when running in test env regardless of source', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    const { tryConsumeQuota } = await import('../api-quota')
    expect(await tryConsumeQuota('pappers')).toBe(true)
    expect(await tryConsumeQuota('sirene')).toBe(true)
    expect(await tryConsumeQuota('inpi')).toBe(true)
  })

  it('returns true when QUOTA_DISABLED=1 (manual override)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('QUOTA_DISABLED', '1')
    const { tryConsumeQuota } = await import('../api-quota')
    expect(await tryConsumeQuota('pappers')).toBe(true)
  })

  it('fails open when Supabase env vars are missing (no client)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('QUOTA_DISABLED', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    const { tryConsumeQuota } = await import('../api-quota')
    expect(await tryConsumeQuota('pappers')).toBe(true)
  })

  it('getQuotaStatus returns null when no client available', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    const { getQuotaStatus } = await import('../api-quota')
    expect(await getQuotaStatus('pappers')).toBe(null)
  })
})
