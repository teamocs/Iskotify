import { renderHook, act, waitFor } from '@testing-library/react-native'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import type { DrizzleClient } from '../../db/client'

function makeDb(initialFocusEnabled = 1): DrizzleClient {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE user_settings (
      id INTEGER PRIMARY KEY NOT NULL,
      selected_listing_slug TEXT NOT NULL DEFAULT '',
      last_synced_at INTEGER NOT NULL DEFAULT 0,
      full_name TEXT NOT NULL DEFAULT '',
      school TEXT NOT NULL DEFAULT '',
      grade_level INTEGER,
      google_id TEXT,
      email TEXT,
      notifications_enabled INTEGER DEFAULT 1,
      theme TEXT NOT NULL DEFAULT 'system',
      focus_mode_enabled INTEGER NOT NULL DEFAULT 1,
      google_calendar_connected INTEGER NOT NULL DEFAULT 0,
      income_bracket TEXT,
      gwa REAL,
      province TEXT,
      city TEXT,
      hs_gwa_g8 REAL,
      hs_gwa_g9 REAL,
      hs_gwa_g10 REAL,
      hs_gwa_g11 REAL,
      school_type TEXT,
      is_indigenous INTEGER DEFAULT 0,
      target_campus TEXT,
      score_disclaimer_ack INTEGER NOT NULL DEFAULT 0,
      target_exams TEXT NOT NULL DEFAULT '[]',
      target_courses TEXT NOT NULL DEFAULT '[]',
      school_region TEXT NOT NULL DEFAULT ''
    );
    INSERT INTO user_settings (id, focus_mode_enabled) VALUES (1, ${initialFocusEnabled});
  `)
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

const mockDb = jest.fn<DrizzleClient, []>()

jest.mock('../useDb', () => ({
  useDb: () => mockDb(),
}))

import { useFocusModePref } from '../useFocusModePref'

describe('useFocusModePref', () => {
  it('defaults to enabled=true while loading', () => {
    mockDb.mockReturnValue(makeDb(1))
    const { result } = renderHook(() => useFocusModePref())
    // Initial synchronous render before SELECT resolves
    expect(result.current.enabled).toBe(true)
    expect(result.current.loading).toBe(true)
  })

  it('reads the persisted value on mount (true case)', async () => {
    mockDb.mockReturnValue(makeDb(1))
    const { result } = renderHook(() => useFocusModePref())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.enabled).toBe(true)
  })

  it('reads the persisted value on mount (false case)', async () => {
    mockDb.mockReturnValue(makeDb(0))
    const { result } = renderHook(() => useFocusModePref())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.enabled).toBe(false)
  })

  it('setEnabled(false) updates state immediately and persists to DB', async () => {
    const db = makeDb(1)
    mockDb.mockReturnValue(db)
    const { result } = renderHook(() => useFocusModePref())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.setEnabled(false)
      await new Promise(r => setTimeout(r, 50))
    })
    expect(result.current.enabled).toBe(false)

    // Re-mount the hook with the same DB — should read the persisted false
    const { result: result2 } = renderHook(() => useFocusModePref())
    await waitFor(() => expect(result2.current.loading).toBe(false))
    expect(result2.current.enabled).toBe(false)
  })

  it('setEnabled(true) flips back from false', async () => {
    mockDb.mockReturnValue(makeDb(0))
    const { result } = renderHook(() => useFocusModePref())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.enabled).toBe(false)

    await act(async () => {
      result.current.setEnabled(true)
      await new Promise(r => setTimeout(r, 50))
    })
    expect(result.current.enabled).toBe(true)
  })

  it('returns enabled=true when user_settings row does NOT exist (fresh install)', async () => {
    const raw = new Database(':memory:')
    raw.exec(`
      CREATE TABLE user_settings (
        id INTEGER PRIMARY KEY NOT NULL,
        focus_mode_enabled INTEGER NOT NULL DEFAULT 1
      );
    `)
    // Note: NO INSERT — the row doesn't exist yet
    const db = drizzle(raw, { schema }) as unknown as DrizzleClient
    mockDb.mockReturnValue(db)

    const { result } = renderHook(() => useFocusModePref())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.enabled).toBe(true)  // default
  })
})
