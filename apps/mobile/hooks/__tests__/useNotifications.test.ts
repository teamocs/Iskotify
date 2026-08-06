import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { renderHook, waitFor, act } from '@testing-library/react-native'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { useNotifications } from '../useNotifications'

// useNotifications() reads its db via useDb() — stub it so each test gets its
// own controllable in-memory db (same pattern as useRecordSrs.test.ts).
let mockDb: DrizzleClient | null = null
jest.mock('../useDb', () => ({ useDb: () => mockDb }))

const mockRequestPermissions = jest.fn()
const mockSchedule = jest.fn().mockResolvedValue(undefined)
const mockCancelAll = jest.fn().mockResolvedValue(undefined)
jest.mock('../../services/notifications', () => ({
  requestNotificationPermissions: (...args: unknown[]) => mockRequestPermissions(...args),
  scheduleIskotifyNotifications: (...args: unknown[]) => mockSchedule(...args),
  cancelAllIskotifyNotifications: (...args: unknown[]) => mockCancelAll(...args),
}))

function makeDb(): DrizzleClient {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup column/table on re-run */ } }
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

// Finding 2 regression: setReminderHour/toggleWeeklySummary used to call
// scheduleIskotifyNotifications directly, bypassing requestNotificationPermissions
// — unlike the sibling schedule()/toggle(), which always gate on it first. A
// user whose OS permission was never granted (or was revoked) would silently
// reschedule against an ungranted permission.
describe('useNotifications — permission gate (Finding 2 regression)', () => {
  afterEach(() => {
    mockDb = null
    mockRequestPermissions.mockReset()
    mockSchedule.mockReset()
    mockCancelAll.mockReset()
  })

  it('setReminderHour requests permission before rescheduling, and skips scheduling when denied', async () => {
    mockDb = makeDb()
    mockRequestPermissions.mockResolvedValue(false)
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.ready).toBe(true))

    await act(async () => { await result.current.setReminderHour(14, []) })

    expect(mockRequestPermissions).toHaveBeenCalledTimes(1)
    expect(mockSchedule).not.toHaveBeenCalled()
  })

  it('setReminderHour reschedules once permission is granted', async () => {
    mockDb = makeDb()
    mockRequestPermissions.mockResolvedValue(true)
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.ready).toBe(true))

    await act(async () => { await result.current.setReminderHour(14, []) })

    expect(mockRequestPermissions).toHaveBeenCalledTimes(1)
    expect(mockSchedule).toHaveBeenCalledWith([], expect.objectContaining({ dailyReminderHour: 14 }))
  })

  it('toggleWeeklySummary requests permission before rescheduling, and skips scheduling when denied', async () => {
    mockDb = makeDb()
    mockRequestPermissions.mockResolvedValue(false)
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.ready).toBe(true))

    await act(async () => { await result.current.toggleWeeklySummary([]) })

    expect(mockRequestPermissions).toHaveBeenCalledTimes(1)
    expect(mockSchedule).not.toHaveBeenCalled()
  })

  it('toggleWeeklySummary reschedules once permission is granted', async () => {
    mockDb = makeDb()
    mockRequestPermissions.mockResolvedValue(true)
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.ready).toBe(true))

    await act(async () => { await result.current.toggleWeeklySummary([]) })

    expect(mockRequestPermissions).toHaveBeenCalledTimes(1)
    expect(mockSchedule).toHaveBeenCalledWith([], expect.objectContaining({ weeklySummaryEnabled: false }))
  })
})
