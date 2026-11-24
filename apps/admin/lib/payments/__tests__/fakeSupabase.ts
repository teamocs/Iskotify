import { vi } from 'vitest'

// An in-memory stand-in for the service-role Supabase client, covering just the
// calls the payment routes make. Shared by the payment route tests.
export type FakeRow = Record<string, unknown>

export function fakeSupabase() {
  const entitlements = new Map<string, FakeRow>()
  const events = new Map<string, FakeRow>()
  const users = new Set<string>()
  const fail = { insertEvent: false, rpc: false, select: false, getUserById: false, markProcessed: false }
  const tokens = new Map<string, string>()

  // Mirrors migration 067's grant_entitlement / revoke_play_entitlement.
  const rpc = vi.fn(async (fn: string, args: { p_uid: string; p_source?: string; p_premium?: boolean; p_event_at?: string | null }) => {
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
    // Mirrors migration 075's apply_play_event.
    if (fn === 'apply_play_event') {
      const at = args.p_event_at ?? now
      if (e?.play_event_at && (e.play_event_at as string) > at) return { data: false, error: null }
      const kept = !!e?.premium && e.source !== 'play'
      entitlements.set(args.p_uid, {
        ...e, user_id: args.p_uid, premium: kept || args.p_premium!,
        source: kept ? e!.source : args.p_premium ? 'play' : e?.source ?? 'play',
        granted_at: args.p_premium ? (e?.premium ? e.granted_at ?? now : now) : e?.granted_at ?? null,
        revoked_at: kept ? e!.revoked_at : args.p_premium ? null : e && !e.premium ? e.revoked_at : now,
        updated_at: now, play_event_at: at,
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
        events.set(row.id as string, { processed_at: null, ...row })
        return { error: null }
      }),
      select: vi.fn(() => ({
        eq: vi.fn((_col: string, val: string) => ({
          maybeSingle: vi.fn(async () => {
            if (fail.select) return { data: null, error: { message: 'db down' } }
            const rows = table === 'entitlements' ? entitlements : events
            return { data: rows.get(val) ?? null, error: null }
          }),
        })),
      })),
      update: vi.fn((patch: FakeRow) => ({
        eq: vi.fn(async (_col: string, val: string) => {
          if (fail.markProcessed) return { error: { message: 'db down' } }
          if (table === 'payment_events') events.set(val, { ...events.get(val), ...patch })
          return { error: null }
        }),
      })),
    })),
  }

  return { client, entitlements, events, users, fail, tokens }
}
