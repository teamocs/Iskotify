import { vi } from 'vitest'

// An in-memory stand-in for the service-role Supabase client, covering just the
// calls the payment routes make. Shared by the payment route tests.
export type FakeRow = Record<string, unknown>

export function fakeSupabase() {
  const entitlements = new Map<string, FakeRow>()
  const events = new Map<string, FakeRow>()
  const users = new Set<string>()
  const fail = { insertEvent: false, rpc: false, select: false, getUserById: false }
  const tokens = new Map<string, string>()

  // Mirrors migration 067's grant_entitlement / revoke_play_entitlement.
  const rpc = vi.fn(async (fn: string, args: { p_uid: string; p_source?: string }) => {
    if (fail.rpc) return { data: null, error: { message: 'db down' } }
    const now = new Date().toISOString()
    const e = entitlements.get(args.p_uid)
    if (fn === 'grant_entitlement') {
      if (e && e.premium && args.p_source === 'play' && e.source !== 'play') return { data: false, error: null }
      entitlements.set(args.p_uid, {
        user_id: args.p_uid, premium: true, source: args.p_source,
        granted_at: e?.premium ? (e.granted_at ?? now) : now, revoked_at: null, updated_at: now,
      })
      return { data: true, error: null }
    }
    if (fn === 'revoke_play_entitlement') {
      if (!e || !e.premium || e.source !== 'play') return { data: false, error: null }
      entitlements.set(args.p_uid, { ...e, premium: false, revoked_at: now, updated_at: now })
      return { data: true, error: null }
    }
    throw new Error(`unexpected rpc ${fn}`)
  })

  const client = {
    rpc,
    auth: {
      getUser: vi.fn(async (token: string) => {
        const id = tokens.get(token)
        return id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } }
      }),
      admin: {
        getUserById: vi.fn(async (id: string) => {
          if (fail.getUserById) return { data: { user: null }, error: { status: 500, message: 'auth down' } }
          return users.has(id)
            ? { data: { user: { id } }, error: null }
            : { data: { user: null }, error: { status: 404, message: 'User not found' } }
        }),
      },
    },
    from: vi.fn((table: string) => ({
      insert: vi.fn(async (row: FakeRow) => {
        if (table !== 'payment_events') throw new Error(`unexpected insert into ${table}`)
        if (fail.insertEvent) return { error: { code: 'XX000', message: 'db down' } }
        if (events.has(row.id as string)) return { error: { code: '23505', message: 'duplicate key' } }
        events.set(row.id as string, row)
        return { error: null }
      }),
      select: vi.fn(() => ({
        eq: vi.fn((_col: string, val: string) => ({
          maybeSingle: vi.fn(async () => {
            if (fail.select) return { data: null, error: { message: 'db down' } }
            return { data: table === 'entitlements' ? entitlements.get(val) ?? null : null, error: null }
          }),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(async (_col: string, val: string) => {
          if (table === 'payment_events') events.delete(val)
          return { error: null }
        }),
      })),
    })),
  }

  return { client, entitlements, events, users, fail, tokens }
}
