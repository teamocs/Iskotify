import { syncOnLaunch } from '../sync'
import { userSettings } from '../../db/schema'

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}))

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val, __isEq: true })),
  asc: jest.fn(col => col),
}))

function makeSupabaseChain(data: any[] = []) {
  const chain: any = {
    select: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockResolvedValue({ data }),
  }
  return chain
}

function makeSettingsChain(rows: any[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  }
}

function makeFocusChain(rows: any[]) {
  return {
    from: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockResolvedValue(rows),
  }
}

function makeTx() {
  const run = jest.fn().mockReturnValue(undefined)
  const onConflictDoUpdate = jest.fn(() => ({ run }))
  const values = jest.fn(() => ({ onConflictDoUpdate }))
  const insert = jest.fn(() => ({ values }))
  const set = jest.fn(() => ({ where: jest.fn().mockReturnValue(undefined) }))
  const update = jest.fn(() => ({ set }))
  return { insert, update, onConflictDoUpdate, run }
}

function makeDb(settingsRow: object | null, focusRows: object[] = []) {
  const tx = makeTx()
  const db: any = {
    select: jest.fn(),
    transaction: jest.fn((cb: (tx: any) => void) => {
      cb(tx)
    }),
    _tx: tx,
  }
  // First call returns settings chain, second call returns focus chain
  db.select
    .mockImplementationOnce(() => makeSettingsChain(settingsRow ? [settingsRow] : []))
    .mockImplementationOnce(() => makeFocusChain(focusRows))
    // Default for any additional calls
    .mockImplementation(() => makeSettingsChain([]))
  return db
}

beforeEach(() => {
  jest.clearAllMocks()
  const { supabase } = require('../supabase')
  supabase.from.mockImplementation(() => makeSupabaseChain())
  supabase.auth.getUser.mockResolvedValue({ data: { user: null } })
})

describe('syncOnLaunch', () => {
  it('returns early when both focusListings is empty and selectedListingSlug is empty', async () => {
    const db = makeDb({ id: 1, selectedListingSlug: '', lastSyncedAt: 0 }, [])
    await syncOnLaunch(db as any)
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('returns early when no settings row exists', async () => {
    const db = makeDb(null, [])
    await syncOnLaunch(db as any)
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('calls supabase.from for all four tables when slug is set via fallback', async () => {
    const { supabase } = require('../supabase')
    const db = makeDb({ id: 1, selectedListingSlug: 'upcat', lastSyncedAt: 0 }, [])
    await syncOnLaunch(db as any)
    expect(supabase.from).toHaveBeenCalledWith('listings')
    expect(supabase.from).toHaveBeenCalledWith('flashcard_subjects')
    expect(supabase.from).toHaveBeenCalledWith('flashcard_topics')
    expect(supabase.from).toHaveBeenCalledWith('flashcards')
  })

  it('calls db.transaction when slug is set via fallback', async () => {
    const db = makeDb({ id: 1, selectedListingSlug: 'upcat', lastSyncedAt: 1000 }, [])
    await syncOnLaunch(db as any)
    expect(db.transaction).toHaveBeenCalledTimes(1)
  })

  it('does not throw when supabase fails', async () => {
    const { supabase } = require('../supabase')
    supabase.from.mockImplementation(() => { throw new Error('network') })
    const db = makeDb({ id: 1, selectedListingSlug: 'upcat', lastSyncedAt: 0 }, [])
    await expect(syncOnLaunch(db as any)).resolves.toBeUndefined()
  })

  it('fetches cards for all focus listings when focusRows is set', async () => {
    const { supabase } = require('../supabase')
    const focusRows = [
      { listingSlug: 'upcat', priority: 1, addedAt: 1000 },
      { listingSlug: 'dost-sei', priority: 2, addedAt: 1000 },
    ]
    const db = makeDb({ id: 1, selectedListingSlug: 'upcat', lastSyncedAt: 0 }, focusRows)
    await syncOnLaunch(db as any)
    // flashcards should be fetched twice (once per slug)
    const flashcardCalls = supabase.from.mock.calls.filter((c: string[]) => c[0] === 'flashcards')
    expect(flashcardCalls).toHaveLength(2)
    expect(db.transaction).toHaveBeenCalledTimes(1)
  })
})

// ─── pullUserData tests (real in-memory SQLite via better-sqlite3) ───────────

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import type { DrizzleClient } from '../../db/client'
import { pullUserData } from '../sync'

function makeTestDb(): DrizzleClient {
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
      focus_mode_enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE focus_listings (
      listing_slug TEXT PRIMARY KEY NOT NULL,
      priority INTEGER NOT NULL,
      added_at INTEGER NOT NULL
    );
    CREATE TABLE saved_listings (
      id TEXT PRIMARY KEY NOT NULL,
      saved_at INTEGER NOT NULL
    );
    CREATE TABLE saved_decks (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      topic_ids TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE user_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      flashcard_id TEXT NOT NULL,
      correct INTEGER NOT NULL,
      answered_at INTEGER NOT NULL
    );
    CREATE TABLE practice_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      listing_slug TEXT NOT NULL DEFAULT '',
      topic_id TEXT NOT NULL DEFAULT '',
      deck_id TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      duration_secs INTEGER NOT NULL DEFAULT 0,
      completed_at INTEGER NOT NULL
    );
  `)
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

describe('pullUserData', () => {
  let supabase: any

  beforeEach(() => {
    jest.clearAllMocks()
    supabase = require('../supabase').supabase
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  })

  it('returns silently when user is not signed in', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } })
    const db = makeTestDb()
    await expect(pullUserData(db)).resolves.toBeUndefined()
  })

  it('returns silently when Supabase has no row for the user', async () => {
    const fromBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    }
    supabase.from.mockReturnValue(fromBuilder)
    const db = makeTestDb()
    await expect(pullUserData(db)).resolves.toBeUndefined()
  })

  it('restores focus_listings + saved_listings + saved_decks from remote', async () => {
    const fromBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          focus_listings: [{ listingSlug: 'upcat-2026', priority: 1, addedAt: 100 }],
          saved_listings: [{ id: 'list-1', savedAt: 200 }],
          saved_decks: [{ id: 'deck-1', name: 'My Deck', topicIds: '[]', createdAt: 300 }],
          user_progress: [],
          practice_sessions: [],
          settings: { fullName: 'Juan', school: 'UP', gradeLevel: 11 },
        },
        error: null,
      }),
    }
    supabase.from.mockReturnValue(fromBuilder)
    const db = makeTestDb()
    await pullUserData(db)
    const focusRows = await db.select().from(schema.focusListings)
    expect(focusRows).toHaveLength(1)
    expect(focusRows[0]?.listingSlug).toBe('upcat-2026')
    const savedRows = await db.select().from(schema.savedListings)
    expect(savedRows).toHaveLength(1)
    const deckRows = await db.select().from(schema.savedDecks)
    expect(deckRows).toHaveLength(1)
  })

  it('restores user_progress from remote', async () => {
    const fromBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          focus_listings: [],
          saved_listings: [],
          saved_decks: [],
          user_progress: [
            { flashcardId: 'fc-1', correct: 1, answeredAt: 500 },
            { flashcardId: 'fc-2', correct: 0, answeredAt: 600 },
          ],
          practice_sessions: [],
          settings: null,
        },
        error: null,
      }),
    }
    supabase.from.mockReturnValue(fromBuilder)
    const db = makeTestDb()
    await pullUserData(db)
    const progressRows = await db.select().from(schema.userProgress)
    expect(progressRows).toHaveLength(2)
    expect(progressRows.map(r => r.flashcardId).sort()).toEqual(['fc-1', 'fc-2'])
  })

  it('restores practice_sessions from remote', async () => {
    const fromBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          focus_listings: [],
          saved_listings: [],
          saved_decks: [],
          user_progress: [],
          practice_sessions: [
            { listingSlug: '', topicId: 'pre-assess-Mathematics', deckId: '', score: 4, total: 4, durationSecs: 0, completedAt: 1000 },
            { listingSlug: '', topicId: 'pre-assess-Science', deckId: '', score: 2, total: 4, durationSecs: 0, completedAt: 1000 },
          ],
          settings: null,
        },
        error: null,
      }),
    }
    supabase.from.mockReturnValue(fromBuilder)
    const db = makeTestDb()
    await pullUserData(db)
    const sessionRows = await db.select().from(schema.practiceSessions)
    expect(sessionRows).toHaveLength(2)
    expect(sessionRows.find(s => s.topicId === 'pre-assess-Mathematics')?.score).toBe(4)
  })

  it('restores full settings row including selectedListingSlug, notificationsEnabled, theme, focusModeEnabled', async () => {
    const fromBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          focus_listings: [],
          saved_listings: [],
          saved_decks: [],
          user_progress: [],
          practice_sessions: [],
          settings: {
            fullName: 'Maria',
            school: 'PSHS',
            gradeLevel: 12,
            googleId: 'g-123',
            email: 'maria@example.com',
            selectedListingSlug: 'upcat-2026',
            notificationsEnabled: false,
            theme: 'dark',
            focusModeEnabled: false,
          },
        },
        error: null,
      }),
    }
    supabase.from.mockReturnValue(fromBuilder)
    const db = makeTestDb()
    await pullUserData(db)
    const settingsRows = await db.select().from(schema.userSettings)
    expect(settingsRows).toHaveLength(1)
    const s = settingsRows[0]!
    expect(s.fullName).toBe('Maria')
    expect(s.school).toBe('PSHS')
    expect(s.gradeLevel).toBe(12)
    expect(s.selectedListingSlug).toBe('upcat-2026')
    expect(s.notificationsEnabled).toBe(false)
    expect(s.theme).toBe('dark')
    expect(s.focusModeEnabled).toBe(false)
  })
})
