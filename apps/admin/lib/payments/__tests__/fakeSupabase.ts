import { vi } from 'vitest'

// An in-memory stand-in for the service-role Supabase client, covering just the
// calls the payment routes make. Shared by the payment route tests.
export type FakeRow = Record<string, unknown>

export function fakeSupabase() {
  const entitlements = new Map<string, FakeRow>()
  const events = new Map<string, FakeRow>()
  const users = new Set<string>()
  const fail = { insertEvent: false, upsert: false, select: false, getUserById: false }
  const tokens = new Map<string, string>()

  const client = {
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
      upsert: vi.fn(async (row: FakeRow) => {
        if (table !== 'entitlements') throw new Error(`unexpected upsert into ${table}`)
        if (fail.upsert) return { error: { message: 'db down' } }
        entitlements.set(row.user_id as string, row)
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
