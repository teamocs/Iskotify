/**
 * Batch C review (1b) — every user-curated writer hook schedules the debounced
 * cloud push, so an edit is on its way to the backup before any later pull
 * could REPLACE it. Real in-memory SQLite; the scheduler is a spy.
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { renderHook, waitFor, act } from '@testing-library/react-native'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { useNotes, pruneOldTrashedNotesDb } from '../useNotes'
import { useNoteLabels } from '../useNoteLabels'
import { useSavedDecks } from '../useSavedDecks'
import { useFocusListings } from '../useFocusListings'
import { useNotifications } from '../useNotifications'
import { useFocusModePref } from '../useFocusModePref'

let mockDb: DrizzleClient
jest.mock('../useDb', () => ({ useDb: () => mockDb }))
jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(cb, [cb]) }))
jest.mock('../../services/notifications', () => ({
  requestNotificationPermissions: jest.fn().mockResolvedValue(true),
  scheduleIskotifyNotifications: jest.fn().mockResolvedValue(undefined),
  cancelAllIskotifyNotifications: jest.fn().mockResolvedValue(undefined),
}))
const mockSchedule = jest.fn()
jest.mock('../../services/pushScheduler', () => ({
  schedulePushUserData: (...a: unknown[]) => mockSchedule(...a),
  flushPendingPush: jest.fn(),
}))
jest.mock('../../services/sync', () => ({
  syncOnLaunch: jest.fn(),
  schedulePushUserData: (...a: unknown[]) => mockSchedule(...a),
}))
jest.mock('../../lib/analytics', () => ({ capture: jest.fn() }))

let raw: InstanceType<typeof Database>
beforeEach(() => {
  raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup */ } }
  mockDb = drizzle(raw, { schema }) as unknown as DrizzleClient
  mockSchedule.mockClear()
})

const NOTE = `INSERT INTO notes (id, title, content, created_at, updated_at, is_trashed, trashed_at) VALUES ('n1', 't', 'c', 1, 1, 1, 1)`

describe('notes', () => {
  const cases: [string, (n: ReturnType<typeof useNotes>) => Promise<unknown>][] = [
    ['createNote', n => n.createNote('text')],
    ['updateNote', n => n.updateNote('n1', { title: 'x' })],
    ['deleteNote', n => n.deleteNote('n1')],
    ['archiveNote', n => n.archiveNote('n1')],
    ['unarchiveNote', n => n.unarchiveNote('n1')],
    ['restoreNote', n => n.restoreNote('n1')],
    ['permanentlyDeleteNote', n => n.permanentlyDeleteNote('n1')],
    ['emptyTrash', n => n.emptyTrash()],
    ['setReminder', n => n.setReminder('n1', 5)],
  ]
  it.each(cases)('%s schedules a push', async (_name, run) => {
    raw.exec(NOTE)
    const { result } = renderHook(() => useNotes('trashed'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await run(result.current) })
    expect(mockSchedule.mock.calls.some(c => c[0] === mockDb)).toBe(true)
  })

  it('pruneOldTrashedNotesDb (launch pruning) schedules a push when it deleted something', async () => {
    raw.exec(`INSERT INTO notes (id, title, content, created_at, updated_at, is_trashed, trashed_at) VALUES ('old', 't', 'c', 1, 1, 1, 1)`)
    await pruneOldTrashedNotesDb(mockDb)
    expect(mockSchedule.mock.calls.some(c => c[0] === mockDb)).toBe(true)
  })
})

describe('note labels', () => {
  const cases: [string, (l: ReturnType<typeof useNoteLabels>) => Promise<unknown>][] = [
    ['createLabel', l => l.createLabel('Study')],
    ['renameLabel', l => l.renameLabel('l1', 'Renamed')],
    ['deleteLabel', l => l.deleteLabel('l1')],
    ['assignLabel', l => l.assignLabel('n1', 'l1')],
    ['unassignLabel', l => l.unassignLabel('n1', 'l1')],
  ]
  it.each(cases)('%s schedules a push', async (_name, run) => {
    raw.exec(`INSERT INTO note_labels (id, name, created_at) VALUES ('l1', 'L', 1)`)
    const { result } = renderHook(() => useNoteLabels())
    await act(async () => { await run(result.current) })
    expect(mockSchedule.mock.calls.some(c => c[0] === mockDb)).toBe(true)
  })
})

describe('saved decks', () => {
  it('createDeck and deleteDeck schedule a push', async () => {
    const { result } = renderHook(() => useSavedDecks())
    await act(async () => { await result.current.createDeck('Mine', ['t1']) })
    expect(mockSchedule).toHaveBeenCalledTimes(1)
    await act(async () => { await result.current.deleteDeck('whatever') })
    expect(mockSchedule).toHaveBeenCalledTimes(2)
  })
})

describe('focus listings', () => {
  it('moveListing schedules a push (add/remove already did)', async () => {
    raw.exec(`INSERT INTO focus_listings (listing_slug, priority, added_at) VALUES ('a', 1, 1), ('b', 2, 2)`)
    const { result } = renderHook(() => useFocusListings())
    await act(async () => { await result.current.refresh().catch(() => {}) })
    await waitFor(() => expect(result.current.focusListings.length).toBe(2))
    mockSchedule.mockClear()
    await act(async () => { await result.current.moveListing('b', 'up') })
    expect(mockSchedule.mock.calls.some(c => c[0] === mockDb)).toBe(true)
    expect(raw.prepare(`SELECT listing_slug AS s FROM focus_listings ORDER BY priority`).all()).toEqual([{ s: 'b' }, { s: 'a' }])
  })
})

describe('settings hooks', () => {
  it('useNotifications reminder hour / weekly summary / master toggle schedule a push', async () => {
    raw.exec(`INSERT INTO user_settings (id) VALUES (1)`)
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.ready).toBe(true))
    await act(async () => { await result.current.setReminderHour(18, []) })
    expect(mockSchedule).toHaveBeenCalledTimes(1)
    await act(async () => { await result.current.toggleWeeklySummary([]) })
    expect(mockSchedule).toHaveBeenCalledTimes(2)
    await act(async () => { await result.current.toggle([]) })
    expect(mockSchedule.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('useFocusModePref.setEnabled schedules a push', async () => {
    const { result } = renderHook(() => useFocusModePref())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { result.current.setEnabled(false); await new Promise(r => setTimeout(r, 20)) })
    expect(mockSchedule.mock.calls.some(c => c[0] === mockDb)).toBe(true)
  })
})
