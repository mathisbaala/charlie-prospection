import { describe, it, expect, afterEach, vi } from 'vitest'

// api-quota.ts checks NODE_ENV === 'test' and short-circuits to allow all
// calls (so unrelated test runs don't need a real Supabase). These tests
// verify that fail-open behaviour + the env-driven cap config + the
// monthly-vs-daily scope distinction (Pappers = monthly because the paid
// plan is billed at 500 credits/month, the rest stay daily-capped).

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

// Scope-aware behaviour : on shunte le short-circuit "NODE_ENV=test" en
// posant NODE_ENV=production, et on mocke @supabase/supabase-js pour capturer
// le `p_today` envoyé à la RPC — c'est la valeur qui matérialise le scope
// (premier-du-mois pour Pappers, date du jour pour les autres).

describe('api-quota — monthly vs daily scope', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.doUnmock('@supabase/supabase-js')
  })

  async function setupMockedClient() {
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        rpc: async (name: string, args: Record<string, unknown>) => {
          rpcCalls.push({ name, args })
          return { data: 1, error: null }
        },
      }),
    }))

    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('QUOTA_DISABLED', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-fake')

    const mod = await import('../api-quota')
    return { mod, rpcCalls }
  }

  it('passes first-of-month as p_today for Pappers (monthly scope)', async () => {
    const { mod, rpcCalls } = await setupMockedClient()
    await mod.tryConsumeQuota('pappers')

    expect(rpcCalls).toHaveLength(1)
    const args = rpcCalls[0].args as { p_source: string; p_cap: number; p_today: string }
    expect(args.p_source).toBe('pappers')
    expect(args.p_today).toMatch(/^\d{4}-\d{2}-01$/)
    const now = new Date()
    const expectedPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    expect(args.p_today).toBe(expectedPeriod)
  })

  it('passes today as p_today for Sirene/INPI/BODACC (daily scope)', async () => {
    const { mod, rpcCalls } = await setupMockedClient()
    await mod.tryConsumeQuota('sirene')
    await mod.tryConsumeQuota('inpi')
    await mod.tryConsumeQuota('bodacc')

    const today = new Date().toISOString().slice(0, 10)
    expect(rpcCalls).toHaveLength(3)
    for (const call of rpcCalls) {
      const args = call.args as { p_today: string }
      expect(args.p_today).toBe(today)
    }
  })

  it('uses PAPPERS_MONTHLY_LIMIT env override for Pappers cap', async () => {
    vi.stubEnv('PAPPERS_MONTHLY_LIMIT', '250')
    const { mod, rpcCalls } = await setupMockedClient()
    await mod.tryConsumeQuota('pappers')

    const args = rpcCalls[0].args as { p_cap: number }
    expect(args.p_cap).toBe(250)
  })

  it('falls back to PAPPERS_DAILY_LIMIT for Pappers when MONTHLY is unset (legacy grace)', async () => {
    vi.stubEnv('PAPPERS_MONTHLY_LIMIT', '')
    vi.stubEnv('PAPPERS_DAILY_LIMIT', '777')
    const { mod, rpcCalls } = await setupMockedClient()
    await mod.tryConsumeQuota('pappers')

    const args = rpcCalls[0].args as { p_cap: number }
    expect(args.p_cap).toBe(777)
  })

  it('defaults to 500 for Pappers when no env var is set', async () => {
    vi.stubEnv('PAPPERS_MONTHLY_LIMIT', '')
    vi.stubEnv('PAPPERS_DAILY_LIMIT', '')
    const { mod, rpcCalls } = await setupMockedClient()
    await mod.tryConsumeQuota('pappers')

    const args = rpcCalls[0].args as { p_cap: number }
    expect(args.p_cap).toBe(500)
  })

  it('returns false when RPC reports cap-hit (data === -1)', async () => {
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        rpc: async () => ({ data: -1, error: null }),
      }),
    }))
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('QUOTA_DISABLED', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-fake')

    const mod = await import('../api-quota')
    expect(await mod.tryConsumeQuota('pappers')).toBe(false)
  })

  it('fails open (returns true) when RPC errors', async () => {
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: () => ({
        rpc: async () => ({ data: null, error: { message: 'boom' } }),
      }),
    }))
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('QUOTA_DISABLED', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-fake')

    const mod = await import('../api-quota')
    expect(await mod.tryConsumeQuota('pappers')).toBe(true)
  })
})
