/** Batch C review (5), end-to-end through pushUserData: a slow push is never overtaken. */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { schedulePushUserData, PUSH_DEBOUNCE_MS, _resetPushSchedulerForTests } from '../sync'

const mockState: { upsert: jest.Mock } = { upsert: jest.fn() }
jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'u1' } } })) },
    from: jest.fn(() => ({ upsert: (...a: unknown[]) => mockState.upsert(...a) })),
  },
}))
jest.mock('../questionReports', () => ({ pushPendingReports: jest.fn() }))

function makeDb() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup */ } }
  return { raw, db: drizzle(raw, { schema }) as unknown as DrizzleClient }
}

beforeEach(() => { jest.useFakeTimers(); _resetPushSchedulerForTests() })
afterEach(() => { jest.useRealTimers() })

it('a push scheduled while another upsert is in flight waits, then runs once with the newest mockState', async () => {
  const { raw, db } = makeDb()
  let release!: () => void
  const first = new Promise<{ error: null }>(r => { release = () => r({ error: null }) })
  mockState.upsert = jest.fn().mockReturnValueOnce(first).mockResolvedValue({ error: null })

  schedulePushUserData(db)
  await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS)
  expect(mockState.upsert).toHaveBeenCalledTimes(1)

  raw.exec(`INSERT INTO practice_sessions (listing_slug, score, total, completed_at) VALUES ('upcat', 1, 2, 1)`)
  schedulePushUserData(db)
  await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS)
  expect(mockState.upsert).toHaveBeenCalledTimes(1) // old push still in flight: no overlap

  release()
  await jest.advanceTimersByTimeAsync(0)
  await jest.advanceTimersByTimeAsync(0)
  expect(mockState.upsert).toHaveBeenCalledTimes(2)
  expect(mockState.upsert.mock.calls[1][0].practice_sessions).toHaveLength(1)
})
