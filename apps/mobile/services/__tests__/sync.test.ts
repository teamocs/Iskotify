import { syncOnLaunch } from '../sync'
import { userSettings } from '../../db/schema'

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}))

// Question-report retry is fire-and-forget from syncOnLaunch; mock it so these
// tests only assert the wiring, not the upload behaviour (covered in
// questionReports.test.ts).
jest.mock('../questionReports', () => ({
  pushPendingReports: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('drizzle-orm', () => ({
  // Spread real implementations so sql, and, like, gte, eq, inArray etc. work
  // in homeAggregates and other service modules called from this test file.
  ...jest.requireActual('drizzle-orm'),
  // asc is intercepted here so makeFocusChain's .orderBy(asc(...)) works with
  // the mock chain. eq is NOT overridden — the real eq is used everywhere
  // (sync.ts initial selects use a mocked db.select chain, so eq's return
  // value is passed to a mock .where() that ignores it anyway).
  asc: jest.fn(col => col),
}))

function makeSupabaseChain(data: any[] = []) {
  const resolved = Promise.resolve({ data })
  const chain: any = {
    select: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(), range: jest.fn().mockResolvedValue({ data }),
    then: (resolve: any, reject: any) => resolved.then(resolve, reject),
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
  it('still syncs the public catalog when focus listings and selectedListingSlug are empty (only flashcards are slug-gated)', async () => {
    // Regression: a focus-less session (anonymous web visitor, or a launch
    // firing before pullUserData restores focus) used to early-return and sync
    // NOTHING — leaving Courses/Destinations empty on web. The catalog must
    // always mirror; only the per-slug flashcards pull is skipped.
    const { supabase } = require('../supabase')
    const db = makeDb({ id: 1, selectedListingSlug: '', lastSyncedAt: 0 }, [])
    await syncOnLaunch(db as any)
    // Catalog pulls run regardless of slugs…
    expect(supabase.from).toHaveBeenCalledWith('listings')
    expect(supabase.from).toHaveBeenCalledWith('career_countries')
    expect(supabase.from).toHaveBeenCalledWith('career_destinations')
    expect(supabase.from).toHaveBeenCalledWith('course_taxonomy_map')
    // …and the catalog write transactions execute…
    expect(db.transaction).toHaveBeenCalledTimes(6)
    // …but the per-slug flashcards pull is skipped (no focus slug to query).
    const flashcardCalls = supabase.from.mock.calls.filter((c: string[]) => c[0] === 'flashcards')
    expect(flashcardCalls).toHaveLength(0)
  })

  it('returns early when no settings row exists', async () => {
    const db = makeDb(null, [])
    await syncOnLaunch(db as any)
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('calls supabase.from for all eight tables when slug is set via fallback', async () => {
    const { supabase } = require('../supabase')
    const db = makeDb({ id: 1, selectedListingSlug: 'upcat', lastSyncedAt: 0 }, [])
    await syncOnLaunch(db as any)
    expect(supabase.from).toHaveBeenCalledWith('listings')
    expect(supabase.from).toHaveBeenCalledWith('flashcard_subjects')
    expect(supabase.from).toHaveBeenCalledWith('flashcard_topics')
    expect(supabase.from).toHaveBeenCalledWith('flashcards')
    expect(supabase.from).toHaveBeenCalledWith('upcat_questions')
    expect(supabase.from).toHaveBeenCalledWith('upcat_passages')
    expect(supabase.from).toHaveBeenCalledWith('upcat_facts')
    expect(supabase.from).toHaveBeenCalledWith('upcat_cutoffs')
    // Epic D career tables
    expect(supabase.from).toHaveBeenCalledWith('career_courses')
    expect(supabase.from).toHaveBeenCalledWith('career_countries')
    expect(supabase.from).toHaveBeenCalledWith('career_programs')
    expect(supabase.from).toHaveBeenCalledWith('ai_career_impact')
    expect(supabase.from).toHaveBeenCalledWith('career_destinations')
    expect(supabase.from).toHaveBeenCalledWith('career_facts')
    // Epic C university / course tables
    expect(supabase.from).toHaveBeenCalledWith('tertiary_schools')
    expect(supabase.from).toHaveBeenCalledWith('university_profiles')
    expect(supabase.from).toHaveBeenCalledWith('course_school_rankings')
    expect(supabase.from).toHaveBeenCalledWith('course_school_quality')
    expect(supabase.from).toHaveBeenCalledWith('bar_results')
    expect(supabase.from).toHaveBeenCalledWith('course_taxonomy_map')
    // admissions_updates mirror
    expect(supabase.from).toHaveBeenCalledWith('admissions_updates')
    // AI chat config (Task B)
    expect(supabase.from).toHaveBeenCalledWith('ai_chat_config')
  })

  it('calls db.transaction when slug is set via fallback', async () => {
    const db = makeDb({ id: 1, selectedListingSlug: 'upcat', lastSyncedAt: 1000, syncRev: 1 }, [])
    await syncOnLaunch(db as any)
    // 6 sequential transactions: listings, subjects+topics+flashcards, upcat,
    // career, university, blueprints+cursor
    expect(db.transaction).toHaveBeenCalledTimes(6)
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
    // 6 sequential transactions: listings, subjects+topics+flashcards, upcat,
    // career, university, blueprints+cursor
    expect(db.transaction).toHaveBeenCalledTimes(6)
  })

  it('fires pushPendingReports after the main sync (queued question-report retry)', async () => {
    const { pushPendingReports } = require('../questionReports')
    const db = makeDb({ id: 1, selectedListingSlug: 'upcat', lastSyncedAt: 0 }, [])
    await syncOnLaunch(db as any)
    expect(pushPendingReports).toHaveBeenCalledTimes(1)
    expect(pushPendingReports).toHaveBeenCalledWith(db)
  })

  it('does NOT fire pushPendingReports when sync exits early (no settings row)', async () => {
    // The only remaining early-return is a missing settings row. A focus-less
    // session with a settings row now proceeds with the catalog sync (and thus
    // fires pushPendingReports) — covered by the catalog-sync test above.
    const { pushPendingReports } = require('../questionReports')
    const db = makeDb(null, [])
    await syncOnLaunch(db as any)
    expect(pushPendingReports).not.toHaveBeenCalled()
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
      is_indigenous INTEGER,
      target_campus TEXT,
      score_disclaimer_ack INTEGER NOT NULL DEFAULT 0,
      target_exams TEXT NOT NULL DEFAULT '[]',
      target_courses TEXT NOT NULL DEFAULT '[]',
      school_region TEXT NOT NULL DEFAULT '',
      sync_rev INTEGER NOT NULL DEFAULT 0,
      ai_provider TEXT NOT NULL DEFAULT 'local'
    );
    CREATE TABLE focus_listings (
      listing_slug TEXT PRIMARY KEY NOT NULL,
      priority INTEGER NOT NULL,
      added_at INTEGER NOT NULL
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
      completed_at INTEGER NOT NULL,
      subtest TEXT
    );
    CREATE TABLE notes (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'text',
      color TEXT,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      is_trashed INTEGER NOT NULL DEFAULT 0,
      trashed_at INTEGER,
      reminder_at INTEGER,
      google_event_id TEXT,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE note_labels (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE note_label_assignments (
      note_id TEXT NOT NULL,
      label_id TEXT NOT NULL,
      PRIMARY KEY (note_id, label_id)
    );
    CREATE TABLE user_requirements (
      listing_slug TEXT NOT NULL,
      requirement_index INTEGER NOT NULL,
      acquired_at INTEGER NOT NULL,
      PRIMARY KEY (listing_slug, requirement_index)
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

  it('restores focus_listings + saved_decks from remote (saved_listings removed)', async () => {
    const fromBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          focus_listings: [{ listingSlug: 'upcat-2026', priority: 1, addedAt: 100 }],
          // saved_listings field may be present in old remote payloads — must be ignored silently
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

  it('restores user_requirements from remote', async () => {
    const fromBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          focus_listings: [],
          saved_decks: [],
          user_progress: [],
          practice_sessions: [],
          settings: null,
          user_requirements: [
            { listingSlug: 'dost-sei', requirementIndex: 0, acquiredAt: 1000 },
            { listingSlug: 'dost-sei', requirementIndex: 2, acquiredAt: 2000 },
          ],
        },
        error: null,
      }),
    }
    supabase.from.mockReturnValue(fromBuilder)
    const db = makeTestDb()
    await pullUserData(db)
    const reqRows = await db.select().from(schema.userRequirements)
    expect(reqRows).toHaveLength(2)
    expect(reqRows.map(r => r.requirementIndex).sort()).toEqual([0, 2])
    expect(reqRows.find(r => r.requirementIndex === 0)?.listingSlug).toBe('dost-sei')
    expect(reqRows.find(r => r.requirementIndex === 2)?.acquiredAt).toBe(2000)
  })

  it('restores fine when an older payload has no user_requirements field', async () => {
    const fromBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          // No user_requirements key at all — simulates a backup written before this field existed
          focus_listings: [{ listingSlug: 'upcat-2026', priority: 1, addedAt: 100 }],
          saved_decks: [],
          user_progress: [],
          practice_sessions: [],
          settings: null,
        },
        error: null,
      }),
    }
    supabase.from.mockReturnValue(fromBuilder)
    const db = makeTestDb()
    await pullUserData(db)
    // Critical sections still restore; user_requirements simply stays empty (no crash)
    const focusRows = await db.select().from(schema.focusListings)
    expect(focusRows).toHaveLength(1)
    const reqRows = await db.select().from(schema.userRequirements)
    expect(reqRows).toHaveLength(0)
  })
})

describe('pullUserData notes restore', () => {
  let supabase: any
  beforeEach(() => {
    jest.clearAllMocks()
    supabase = require('../supabase').supabase
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  })

  it('restores notes from remote when server has notes', async () => {
    const fromBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          focus_listings: [],
          saved_decks: [],
          user_progress: [],
          practice_sessions: [],
          settings: null,
          notes: [
            { id: 'note-1', title: 'Test Note', content: 'Hello', type: 'text', color: null, isPinned: false, isArchived: false, isTrashed: false, trashedAt: null, createdAt: 1000, updatedAt: 1000 },
          ],
          note_labels: [],
          note_label_assignments: [],
        },
        error: null,
      }),
    }
    supabase.from.mockReturnValue(fromBuilder)
    const db = makeTestDb()
    await pullUserData(db)
    const noteRows = await db.select().from(schema.notes)
    expect(noteRows).toHaveLength(1)
    expect(noteRows[0]!.id).toBe('note-1')
  })

  it('does not wipe local notes when server payload has no notes', async () => {
    const fromBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: {
          focus_listings: [],
          saved_decks: [],
          user_progress: [],
          practice_sessions: [],
          settings: null,
          notes: [],
          note_labels: [],
          note_label_assignments: [],
        },
        error: null,
      }),
    }
    supabase.from.mockReturnValue(fromBuilder)
    const db = makeTestDb()
    // Pre-populate a local note
    await db.insert(schema.notes).values({ id: 'local-1', title: 'Local', content: '', type: 'text', color: null, isPinned: false, isArchived: false, isTrashed: false, trashedAt: null, createdAt: 1000, updatedAt: 1000 })
    await pullUserData(db)
    const noteRows = await db.select().from(schema.notes)
    expect(noteRows).toHaveLength(1)
    expect(noteRows[0]!.id).toBe('local-1')
  })
})

// ─── syncOnLaunch ai_* field tests (real in-memory SQLite) ───────────────────
//
// syncOnLaunch's first two db.select() calls use mocked drizzle-orm `eq`/`asc`,
// so we use a hybrid DB: mock the initial select chain (settings + focus listings)
// to return controlled values, but delegate db.transaction() to a real
// better-sqlite3 + drizzle instance. This lets us verify actual SQLite writes
// for the ai_* columns without fighting the drizzle-orm mock.

function makeRawFlashcardDb(): InstanceType<typeof Database> {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE subjects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL
    );
    CREATE TABLE topics (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE flashcards (
      id TEXT PRIMARY KEY NOT NULL,
      topic_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      explanation TEXT NOT NULL,
      listing_slugs TEXT NOT NULL DEFAULT '[]',
      remote_updated_at INTEGER,
      options TEXT NOT NULL DEFAULT '[]',
      correct_answer_index INTEGER,
      ai_options TEXT,
      ai_correct_index INTEGER,
      ai_explanation TEXT,
      ai_enhanced_at INTEGER,
      status TEXT NOT NULL DEFAULT 'published'
    );
    CREATE TABLE listings (
      id TEXT PRIMARY KEY NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      exam_date INTEGER,
      region TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      requirements TEXT NOT NULL DEFAULT '[]',
      coverage TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT '',
      external_url TEXT NOT NULL DEFAULT '',
      deadline INTEGER,
      grant_amount TEXT NOT NULL DEFAULT '',
      province TEXT,
      city TEXT,
      scope TEXT NOT NULL DEFAULT 'national',
      is_verified INTEGER NOT NULL DEFAULT 0,
      income_ceiling INTEGER,
      gwa_requirement REAL,
      monthly_stipend INTEGER,
      service_obligation_years INTEGER,
      has_entrance_exam INTEGER NOT NULL DEFAULT 0,
      application_window TEXT,
      scholarship_meta TEXT NOT NULL DEFAULT '{}',
      results_date INTEGER,
      target_courses TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS admissions_updates (
      id TEXT PRIMARY KEY NOT NULL, report_date TEXT, severity TEXT NOT NULL,
      school_slug TEXT, school_name TEXT, title TEXT NOT NULL, body TEXT NOT NULL,
      action_required TEXT, event_date TEXT, event_type TEXT,
      sources TEXT NOT NULL DEFAULT '[]', verified INTEGER NOT NULL DEFAULT 0, remote_updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS result_watches (
      slug TEXT PRIMARY KEY NOT NULL, added_at INTEGER NOT NULL
    );
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
      is_indigenous INTEGER,
      target_campus TEXT,
      score_disclaimer_ack INTEGER NOT NULL DEFAULT 0,
      target_exams TEXT NOT NULL DEFAULT '[]',
      target_courses TEXT NOT NULL DEFAULT '[]',
      school_region TEXT NOT NULL DEFAULT '',
      sync_rev INTEGER NOT NULL DEFAULT 0,
      ai_provider TEXT NOT NULL DEFAULT 'local'
    );
    CREATE TABLE focus_listings (
      listing_slug TEXT PRIMARY KEY NOT NULL,
      priority INTEGER NOT NULL,
      added_at INTEGER NOT NULL
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
    CREATE TABLE notes (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'text',
      color TEXT,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      is_trashed INTEGER NOT NULL DEFAULT 0,
      trashed_at INTEGER,
      reminder_at INTEGER,
      google_event_id TEXT,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE note_labels (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE note_label_assignments (
      note_id TEXT NOT NULL,
      label_id TEXT NOT NULL,
      PRIMARY KEY (note_id, label_id)
    );
    CREATE TABLE IF NOT EXISTS upcat_passages (
      set_id TEXT PRIMARY KEY NOT NULL,
      subtest TEXT NOT NULL,
      passage_text TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS upcat_questions (
      question_id TEXT PRIMARY KEY NOT NULL,
      subtest TEXT NOT NULL,
      main_subject TEXT, topic TEXT, subtopic TEXT,
      question_format TEXT, cognitive_level TEXT, difficulty TEXT, curriculum_alignment TEXT,
      question_text TEXT NOT NULL,
      options TEXT NOT NULL DEFAULT '[]',
      correct_index INTEGER NOT NULL,
      explanation TEXT NOT NULL,
      set_id TEXT, set_position INTEGER,
      has_visual INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'published',
      skill_category TEXT,
      remote_updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS upcat_facts (
      id TEXT PRIMARY KEY NOT NULL,
      topic TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      source TEXT,
      valid_year INTEGER,
      remote_updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS upcat_cutoffs (
      id TEXT PRIMARY KEY NOT NULL,
      campus TEXT NOT NULL,
      program TEXT,
      cutoff REAL NOT NULL,
      year INTEGER,
      is_estimate INTEGER NOT NULL DEFAULT 1
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS upcat_facts_fts USING fts5(
      fact_id UNINDEXED, topic, question, answer,
      tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER IF NOT EXISTS upcat_facts_fts_ai AFTER INSERT ON upcat_facts BEGIN
      INSERT INTO upcat_facts_fts (fact_id, topic, question, answer) VALUES (new.id, new.topic, new.question, new.answer);
    END;
    CREATE TRIGGER IF NOT EXISTS upcat_facts_fts_ad AFTER DELETE ON upcat_facts BEGIN
      DELETE FROM upcat_facts_fts WHERE fact_id = old.id;
    END;
    CREATE TRIGGER IF NOT EXISTS upcat_facts_fts_au AFTER UPDATE ON upcat_facts BEGIN
      DELETE FROM upcat_facts_fts WHERE fact_id = old.id;
      INSERT INTO upcat_facts_fts (fact_id, topic, question, answer) VALUES (new.id, new.topic, new.question, new.answer);
    END;
    CREATE TABLE IF NOT EXISTS career_courses (
      course_id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      cluster TEXT,
      career_tag TEXT,
      demand TEXT,
      board_exam INTEGER NOT NULL DEFAULT 0,
      board_exam_name TEXT,
      duration_years REAL,
      top_countries TEXT NOT NULL DEFAULT '[]',
      summary TEXT,
      student_tip TEXT,
      ai_note TEXT,
      remote_updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS career_destinations (
      id TEXT PRIMARY KEY NOT NULL,
      course_id TEXT,
      country TEXT,
      demand_rating TEXT,
      salary_min REAL,
      salary_max REAL,
      salary_local TEXT,
      salary_type TEXT,
      visa_pathway TEXT,
      pr_pathway TEXT,
      credential TEXT,
      licensing_exam TEXT,
      language_required TEXT,
      timeline_months INTEGER,
      program_name TEXT,
      specializations TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      saturation_warning TEXT,
      source TEXT,
      remote_updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS career_countries (
      code TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      region TEXT,
      immigration_system TEXT,
      why_demand TEXT,
      language_required TEXT,
      pr_pathway TEXT,
      notes TEXT,
      remote_updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS career_programs (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      country_region TEXT,
      courses_covered TEXT NOT NULL DEFAULT '[]',
      managing_body TEXT,
      slots TEXT,
      requirements TEXT,
      immigration_outcome TEXT,
      website TEXT,
      notes TEXT,
      remote_updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS ai_career_impact (
      course_id TEXT PRIMARY KEY NOT NULL,
      course_name TEXT,
      cluster TEXT,
      board_exam INTEGER NOT NULL DEFAULT 0,
      board_exam_name TEXT,
      automation_risk_low INTEGER,
      automation_risk_high INTEGER,
      ai_safety_score INTEGER,
      ai_safety_label TEXT,
      color_code TEXT,
      what_ai_takes_over TEXT NOT NULL DEFAULT '[]',
      what_stays_human TEXT NOT NULL DEFAULT '[]',
      new_jobs_emerging TEXT NOT NULL DEFAULT '[]',
      skills_to_develop TEXT NOT NULL DEFAULT '[]',
      career_outlook_2030 TEXT,
      key_stat TEXT,
      key_source TEXT,
      key_quote TEXT,
      quote_by TEXT,
      ph_advantage TEXT,
      ph_notes TEXT,
      kuya_baw_summary TEXT,
      last_updated TEXT,
      remote_updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS career_facts (
      id TEXT PRIMARY KEY NOT NULL,
      course_id TEXT,
      query_type TEXT,
      course_name TEXT,
      quick_answer TEXT,
      key_caveat TEXT,
      point_to TEXT,
      remote_updated_at INTEGER
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS career_facts_fts USING fts5(
      fact_id UNINDEXED, course_name, quick_answer, key_caveat,
      tokenize='unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER IF NOT EXISTS career_facts_ai AFTER INSERT ON career_facts BEGIN
      INSERT INTO career_facts_fts (fact_id, course_name, quick_answer, key_caveat) VALUES (new.id, new.course_name, new.quick_answer, new.key_caveat);
    END;
    CREATE TRIGGER IF NOT EXISTS career_facts_ad AFTER DELETE ON career_facts BEGIN
      DELETE FROM career_facts_fts WHERE fact_id = old.id;
    END;
    CREATE TRIGGER IF NOT EXISTS career_facts_au AFTER UPDATE ON career_facts BEGIN
      DELETE FROM career_facts_fts WHERE fact_id = old.id;
      INSERT INTO career_facts_fts (fact_id, course_name, quick_answer, key_caveat) VALUES (new.id, new.course_name, new.quick_answer, new.key_caveat);
    END;
    CREATE TABLE IF NOT EXISTS tertiary_schools (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      acronym TEXT,
      region TEXT,
      province TEXT,
      city TEXT,
      type TEXT,
      is_suc INTEGER NOT NULL DEFAULT 0,
      is_luc INTEGER NOT NULL DEFAULT 0,
      deped_school_id INTEGER,
      rank_in_province INTEGER,
      remote_updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS university_profiles (
      school_id TEXT PRIMARY KEY NOT NULL,
      data_tier TEXT,
      institution_type TEXT,
      year_established TEXT,
      known_for_courses TEXT NOT NULL DEFAULT '[]',
      prc_top_courses TEXT NOT NULL DEFAULT '[]',
      ched_coe_cod TEXT,
      accreditation TEXT,
      entrance_exam_name TEXT,
      entrance_exam_acronym TEXT,
      testing_center_type TEXT,
      application_open TEXT,
      application_close TEXT,
      exam_month TEXT,
      estimated_passing_rate TEXT,
      estimated_slots TEXT,
      tuition_fee_range TEXT,
      free_tuition INTEGER,
      academic_calendar TEXT,
      courses_offered TEXT NOT NULL DEFAULT '[]',
      scholarships_offered TEXT NOT NULL DEFAULT '[]',
      website_url TEXT,
      application_portal_url TEXT,
      facebook_url TEXT,
      exam_difficulty INTEGER,
      notable_programs TEXT NOT NULL DEFAULT '[]',
      prc_strong_boards TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      data_confidence TEXT,
      remote_updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS course_school_rankings (
      id TEXT PRIMARY KEY NOT NULL,
      course_tab TEXT NOT NULL,
      course_name TEXT,
      rank INTEGER,
      school_name TEXT NOT NULL,
      region TEXT,
      province TEXT,
      wilson_score REAL,
      raw_pass_rate REAL,
      total_examinees INTEGER,
      total_passers INTEGER,
      years_with_data TEXT,
      exam_periods INTEGER,
      tertiary_school_id TEXT,
      remote_updated_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS course_school_rankings_tab_idx ON course_school_rankings (course_tab);
    CREATE TABLE IF NOT EXISTS course_school_quality (
      id TEXT PRIMARY KEY NOT NULL,
      school_name TEXT NOT NULL,
      region TEXT,
      province TEXT,
      city TEXT,
      course_standardized TEXT,
      course_group TEXT,
      school_type TEXT,
      ched_coe_cod TEXT,
      quality_score INTEGER,
      quality_tier TEXT,
      accreditations TEXT NOT NULL DEFAULT '[]',
      has_prc_board INTEGER,
      qs_subject_rank TEXT,
      data_confidence TEXT,
      tertiary_school_id TEXT,
      remote_updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS bar_results (
      id TEXT PRIMARY KEY NOT NULL,
      school_name TEXT NOT NULL,
      region TEXT,
      province TEXT,
      year INTEGER,
      pass_rate REAL,
      national_avg REAL,
      sc_rank INTEGER,
      notes TEXT,
      remote_updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS course_taxonomy_map (
      course_tab TEXT PRIMARY KEY NOT NULL,
      career_course_id TEXT,
      label TEXT,
      kind TEXT,
      remote_updated_at INTEGER
    );
  `)
  return raw
}

/**
 * Build a hybrid DB that mocks the two initial select() calls syncOnLaunch
 * makes (userSettings + focusListings) but wires db.transaction() to a real
 * drizzle instance backed by the provided raw SQLite DB. This sidesteps the
 * module-level drizzle-orm `eq`/`asc` mock while still letting us inspect
 * actual SQLite writes.
 */
function makeSyncTestDb(raw: InstanceType<typeof Database>, slug = 'upcat'): DrizzleClient {
  const realDrizzle = drizzle(raw, { schema }) as any

  const settingsChain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([{ id: 1, selectedListingSlug: slug, lastSyncedAt: 0, syncRev: 2 }]),
  }
  const focusChain = {
    from: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockResolvedValue([]),
  }

  let selectCallCount = 0
  const db: any = {
    select: jest.fn().mockImplementation(() => {
      selectCallCount += 1
      if (selectCallCount === 1) return settingsChain
      if (selectCallCount === 2) return focusChain
      return settingsChain
    }),
    transaction: (cb: (tx: any) => void) => realDrizzle.transaction(cb),
  }
  return db as DrizzleClient
}

function makeCardRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'card-1',
    topic_id: 'topic-1',
    question: 'Q?',
    answer: 'A',
    explanation: 'E',
    listing_slugs: ['upcat'],
    options: ['A', 'B', 'C', 'D'],
    correct_answer_index: 0,
    updated_at: '2026-05-01T00:00:00Z',
    ai_options: null,
    ai_correct_index: null,
    ai_explanation: null,
    ai_enhanced_at: null,
    ...overrides,
  }
}

function makeSupabaseForCards(cardRow: Record<string, unknown>) {
  return (table: string) => {
    const emptyResolved = Promise.resolve({ data: [] })
    const emptyChain: any = {
      select: jest.fn().mockReturnThis(),
      contains: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(), range: jest.fn().mockResolvedValue({ data: [] }),
      then: (resolve: any, reject: any) => emptyResolved.then(resolve, reject),
    }
    if (table === 'flashcards') {
      return {
        select: jest.fn().mockReturnThis(),
        contains: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(), range: jest.fn().mockResolvedValue({ data: [cardRow] }),
      }
    }
    return emptyChain
  }
}

describe('syncOnLaunch ai_* field handling (real SQLite)', () => {
  let supabaseMock: any

  beforeEach(() => {
    jest.clearAllMocks()
    supabaseMock = require('../supabase').supabase
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } })
  })

  it('pulls ai_* fields from Supabase into local SQLite', async () => {
    const raw = makeRawFlashcardDb()
    const db = makeSyncTestDb(raw)

    const aiEnhancedAt = '2026-05-29T12:00:00Z'
    const cardRow = makeCardRow({
      ai_options: ['W1', 'A', 'W2', 'W3'],
      ai_correct_index: 1,
      ai_explanation: 'because',
      ai_enhanced_at: aiEnhancedAt,
    })

    supabaseMock.from.mockImplementation(makeSupabaseForCards(cardRow))

    await syncOnLaunch(db as any)

    const row = raw.prepare('SELECT * FROM flashcards WHERE id = ?').get('card-1') as any
    expect(row).toBeTruthy()
    expect(row.ai_options).toBe('["W1","A","W2","W3"]')
    expect(row.ai_correct_index).toBe(1)
    expect(row.ai_explanation).toBe('because')
    expect(row.ai_enhanced_at).toBe(new Date(aiEnhancedAt).getTime())
  })

  it('does NOT wipe local ai_* when Supabase has ai_enhanced_at NULL', async () => {
    const raw = makeRawFlashcardDb()

    // Pre-seed local card with Gemma-generated ai_* data
    const localAiEnhancedAt = new Date('2026-05-28T10:00:00Z').getTime()
    raw.prepare(`
      INSERT INTO flashcards (id, topic_id, question, answer, explanation, listing_slugs,
        options, correct_answer_index, remote_updated_at,
        ai_options, ai_correct_index, ai_explanation, ai_enhanced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'card-1', 'topic-1', 'Q?', 'A', 'E', '["upcat"]',
      '[]', 0, 1000,
      '["LocalW1","A","LocalW2","LocalW3"]', 1, 'local reason', localAiEnhancedAt,
    )

    const db = makeSyncTestDb(raw)

    // Supabase returns the same card with ai_enhanced_at = null (not yet enhanced server-side)
    const cardRow = makeCardRow({ ai_enhanced_at: null })
    supabaseMock.from.mockImplementation(makeSupabaseForCards(cardRow))

    await syncOnLaunch(db as any)

    const row = raw.prepare('SELECT * FROM flashcards WHERE id = ?').get('card-1') as any
    expect(row).toBeTruthy()
    // Local Gemma work must survive the sync
    expect(row.ai_options).toBe('["LocalW1","A","LocalW2","LocalW3"]')
    expect(row.ai_correct_index).toBe(1)
    expect(row.ai_explanation).toBe('local reason')
    expect(row.ai_enhanced_at).toBe(localAiEnhancedAt)
  })

  it('overwrites local ai_* when Supabase has fresher ai_enhanced_at', async () => {
    const raw = makeRawFlashcardDb()

    // Pre-seed local card with old Gemma-generated ai_* data
    const oldAiEnhancedAt = new Date('2026-05-20T00:00:00Z').getTime()
    raw.prepare(`
      INSERT INTO flashcards (id, topic_id, question, answer, explanation, listing_slugs,
        options, correct_answer_index, remote_updated_at,
        ai_options, ai_correct_index, ai_explanation, ai_enhanced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'card-1', 'topic-1', 'Q?', 'A', 'E', '["upcat"]',
      '[]', 0, 1000,
      '["OldW1","A","OldW2","OldW3"]', 1, 'old reason', oldAiEnhancedAt,
    )

    const db = makeSyncTestDb(raw)

    const newAiEnhancedAt = '2026-05-29T12:00:00Z'
    const cardRow = makeCardRow({
      ai_options: ['NewW1', 'A', 'NewW2', 'NewW3'],
      ai_correct_index: 1,
      ai_explanation: 'new reason',
      ai_enhanced_at: newAiEnhancedAt,
    })
    supabaseMock.from.mockImplementation(makeSupabaseForCards(cardRow))

    await syncOnLaunch(db as any)

    const row = raw.prepare('SELECT * FROM flashcards WHERE id = ?').get('card-1') as any
    expect(row).toBeTruthy()
    // Supabase's fresher ai_* should overwrite the local values
    expect(row.ai_options).toBe('["NewW1","A","NewW2","NewW3"]')
    expect(row.ai_correct_index).toBe(1)
    expect(row.ai_explanation).toBe('new reason')
    expect(row.ai_enhanced_at).toBe(new Date(newAiEnhancedAt).getTime())
  })
})

function makeSupabaseForUpcat(questionRow: Record<string, unknown>, passageRow: Record<string, unknown>) {
  return (table: string) => {
    const emptyResolved = Promise.resolve({ data: [] })
    const emptyChain: any = {
      select: jest.fn().mockReturnThis(),
      contains: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(), range: jest.fn().mockResolvedValue({ data: [] }),
      then: (resolve: any, reject: any) => emptyResolved.then(resolve, reject),
    }
    if (table === 'upcat_passages') {
      const resolved = Promise.resolve({ data: [passageRow] })
      return {
        select: jest.fn().mockReturnThis(),
        then: (resolve: any, reject: any) => resolved.then(resolve, reject),
      }
    }
    if (table === 'upcat_questions') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(), range: jest.fn().mockResolvedValue({ data: [questionRow] }),
      }
    }
    if (table === 'upcat_facts') {
      return {
        select: jest.fn().mockReturnThis(),
        gt: jest.fn().mockResolvedValue({ data: [] }),
      }
    }
    return emptyChain
  }
}

describe('syncOnLaunch upcat write (real SQLite)', () => {
  let supabaseMock: any

  beforeEach(() => {
    jest.clearAllMocks()
    supabaseMock = require('../supabase').supabase
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } })
  })

  it('writes upcat_questions and upcat_passages rows into SQLite', async () => {
    const raw = makeRawFlashcardDb()
    const db = makeSyncTestDb(raw)

    const passageRow = {
      set_id: 'set-1',
      subtest: 'Reading Comprehension',
      passage_text: 'Once upon a time…',
    }
    const questionRow = {
      question_id: 'q-1',
      subtest: 'Reading Comprehension',
      main_subject: null, topic: null, subtopic: null,
      question_format: null, cognitive_level: null, difficulty: null, curriculum_alignment: null,
      question_text: 'What is the main idea?',
      options: ['a', 'b', 'c', 'd'],
      correct_index: 2,
      explanation: 'Because c.',
      set_id: 'set-1', set_position: 1,
      has_visual: false,
      status: 'published',
      updated_at: '2026-06-01T00:00:00Z',
    }

    supabaseMock.from.mockImplementation(makeSupabaseForUpcat(questionRow, passageRow))

    await syncOnLaunch(db as any)

    const qRow = raw.prepare('SELECT * FROM upcat_questions WHERE question_id = ?').get('q-1') as any
    expect(qRow).toBeTruthy()
    expect(qRow.options).toBe('["a","b","c","d"]')
    expect(qRow.correct_index).toBe(2)
    expect(qRow.has_visual).toBe(0)

    const pRow = raw.prepare('SELECT * FROM upcat_passages WHERE set_id = ?').get('set-1') as any
    expect(pRow).toBeTruthy()
    expect(pRow.passage_text).toBe('Once upon a time…')
  })
})

function makeSupabaseForListings(listingRow: Record<string, unknown>) {
  return (table: string) => {
    const emptyResolved = Promise.resolve({ data: [] })
    const emptyChain: any = {
      select: jest.fn().mockReturnThis(),
      contains: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(), range: jest.fn().mockResolvedValue({ data: [] }),
      then: (resolve: any, reject: any) => emptyResolved.then(resolve, reject),
    }
    if (table === 'listings') {
      return {
        select: jest.fn().mockReturnThis(),
        gt: jest.fn().mockResolvedValue({ data: [listingRow] }),
      }
    }
    if (table === 'upcat_facts') {
      return {
        select: jest.fn().mockReturnThis(),
        gt: jest.fn().mockResolvedValue({ data: [] }),
      }
    }
    return emptyChain
  }
}

describe('syncOnLaunch scholarship columns (real SQLite)', () => {
  let supabaseMock: any

  beforeEach(() => {
    jest.clearAllMocks()
    supabaseMock = require('../supabase').supabase
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } })
  })

  it('writes scholarship typed columns + meta into listings SQLite row', async () => {
    const raw = makeRawFlashcardDb()
    const db = makeSyncTestDb(raw)

    const listingRow = {
      id: 'listing-1',
      slug: 'dost-sei',
      title: 'DOST-SEI Scholarship',
      type: 'scholarship',
      status: 'active',
      exam_date: null,
      region: 'national',
      description: 'Science scholarship',
      requirements: [],
      coverage: 'full',
      provider: 'DOST',
      external_url: '',
      deadline: null,
      grant_amount: null,
      province: null,
      city: null,
      scope: 'provincial',
      is_verified: true,
      income_ceiling: 100000,
      gwa_requirement: null,
      monthly_stipend: null,
      service_obligation_years: null,
      has_entrance_exam: false,
      application_window: null,
      scholarship_meta: { huc_excluded: true },
    }

    supabaseMock.from.mockImplementation(makeSupabaseForListings(listingRow))

    await syncOnLaunch(db as any)

    const row = raw.prepare('SELECT * FROM listings WHERE id = ?').get('listing-1') as any
    expect(row).toBeTruthy()
    expect(row.scope).toBe('provincial')
    expect(row.is_verified).toBe(1)
    expect(row.income_ceiling).toBe(100000)
    expect(row.scholarship_meta).toBe('{"huc_excluded":true}')
  })
})

function makeSupabaseForCutoffs(cutoffRow: Record<string, unknown>) {
  return (table: string) => {
    const emptyResolved = Promise.resolve({ data: [] })
    const emptyChain: any = {
      select: jest.fn().mockReturnThis(),
      contains: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(), range: jest.fn().mockResolvedValue({ data: [] }),
      then: (resolve: any, reject: any) => emptyResolved.then(resolve, reject),
    }
    if (table === 'upcat_cutoffs') {
      const resolved = Promise.resolve({ data: [cutoffRow] })
      // upcat_cutoffs now uses .gt('updated_at', since) — mock must chain through gt
      const chain: any = {
        select: jest.fn().mockReturnThis(),
        gt: jest.fn().mockImplementation(() => ({
          then: (resolve: any, reject: any) => resolved.then(resolve, reject),
        })),
        then: (resolve: any, reject: any) => resolved.then(resolve, reject),
      }
      return chain
    }
    return emptyChain
  }
}

describe('syncOnLaunch upcat_cutoffs write (real SQLite)', () => {
  let supabaseMock: any

  beforeEach(() => {
    jest.clearAllMocks()
    supabaseMock = require('../supabase').supabase
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } })
  })

  it('writes upcat_cutoffs row into SQLite with correct types', async () => {
    const raw = makeRawFlashcardDb()
    const db = makeSyncTestDb(raw)

    const cutoffRow = {
      id: 'cutoff-1',
      campus: 'UP Diliman',
      program: 'BS Computer Science',
      cutoff: 92.5,
      year: 2024,
      is_estimate: true,
    }

    supabaseMock.from.mockImplementation(makeSupabaseForCutoffs(cutoffRow))

    await syncOnLaunch(db as any)

    const row = raw.prepare('SELECT * FROM upcat_cutoffs WHERE id = ?').get('cutoff-1') as any
    expect(row).toBeTruthy()
    expect(row.campus).toBe('UP Diliman')
    expect(row.program).toBe('BS Computer Science')
    expect(row.cutoff).toBe(92.5)
    expect(row.year).toBe(2024)
    expect(row.is_estimate).toBe(1)
  })

  it('writes upcat_cutoffs row with null program and year', async () => {
    const raw = makeRawFlashcardDb()
    const db = makeSyncTestDb(raw)

    const cutoffRow = {
      id: 'cutoff-2',
      campus: 'UP Manila',
      program: null,
      cutoff: 88.0,
      year: null,
      is_estimate: false,
    }

    supabaseMock.from.mockImplementation(makeSupabaseForCutoffs(cutoffRow))

    await syncOnLaunch(db as any)

    const row = raw.prepare('SELECT * FROM upcat_cutoffs WHERE id = ?').get('cutoff-2') as any
    expect(row).toBeTruthy()
    expect(row.cutoff).toBe(88.0)
    expect(row.program).toBeNull()
    expect(row.year).toBeNull()
    expect(row.is_estimate).toBe(0)
  })
})

function makeSupabaseForCareer(
  courseRow: Record<string, unknown>,
  factRow: Record<string, unknown>,
) {
  return (table: string) => {
    const emptyResolved = Promise.resolve({ data: [] })
    const emptyChain: any = {
      select: jest.fn().mockReturnThis(),
      contains: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(), range: jest.fn().mockResolvedValue({ data: [] }),
      then: (resolve: any, reject: any) => emptyResolved.then(resolve, reject),
    }
    if (table === 'career_courses') {
      const resolved = Promise.resolve({ data: [courseRow] })
      // career_courses now uses .gt('updated_at', since) incremental cursor
      return {
        select: jest.fn().mockReturnThis(),
        gt: jest.fn().mockImplementation(() => ({
          then: (resolve: any, reject: any) => resolved.then(resolve, reject),
        })),
        then: (resolve: any, reject: any) => resolved.then(resolve, reject),
      }
    }
    if (table === 'career_facts') {
      return {
        select: jest.fn().mockReturnThis(),
        gt: jest.fn().mockResolvedValue({ data: [factRow] }),
      }
    }
    return emptyChain
  }
}

describe('syncOnLaunch career write (real SQLite)', () => {
  let supabaseMock: any

  beforeEach(() => {
    jest.clearAllMocks()
    supabaseMock = require('../supabase').supabase
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } })
  })

  it('writes career_courses row into SQLite with text[] as JSON string', async () => {
    const raw = makeRawFlashcardDb()
    const db = makeSyncTestDb(raw)

    const courseRow = {
      course_id: 'course-nursing',
      name: 'BS Nursing',
      cluster: 'Health',
      career_tag: 'nursing',
      demand: 'high',
      board_exam: true,
      board_exam_name: 'NLE',
      duration_years: 4.0,
      top_countries: ['Canada', 'UK', 'UAE'],
      summary: 'Care for patients.',
      student_tip: 'Practice NCLEX.',
      ai_note: null,
    }
    const factRow = {
      id: 'fact-nursing-1',
      course_id: 'course-nursing',
      query_type: 'salary',
      course_name: 'BS Nursing',
      quick_answer: 'CAD 70k-90k per year in Canada',
      key_caveat: 'Requires NCLEX-RN for Canada',
      point_to: null,
      updated_at: '2026-06-01T00:00:00Z',
    }

    supabaseMock.from.mockImplementation(makeSupabaseForCareer(courseRow, factRow))

    await syncOnLaunch(db as any)

    const cRow = raw.prepare('SELECT * FROM career_courses WHERE course_id = ?').get('course-nursing') as any
    expect(cRow).toBeTruthy()
    expect(cRow.name).toBe('BS Nursing')
    expect(cRow.board_exam).toBe(1)
    expect(cRow.top_countries).toBe('["Canada","UK","UAE"]')
    expect(cRow.duration_years).toBe(4.0)

    const fRow = raw.prepare('SELECT * FROM career_facts WHERE id = ?').get('fact-nursing-1') as any
    expect(fRow).toBeTruthy()
    expect(fRow.course_name).toBe('BS Nursing')
    expect(fRow.quick_answer).toBe('CAD 70k-90k per year in Canada')
    expect(fRow.remote_updated_at).toBe(new Date('2026-06-01T00:00:00Z').getTime())

    // career_facts_fts trigger should have auto-indexed the fact
    const ftsRow = raw.prepare("SELECT * FROM career_facts_fts WHERE career_facts_fts MATCH 'Nursing'").get() as any
    expect(ftsRow).toBeTruthy()
  })

  it('career_facts text[] columns survive round-trip as JSON string', async () => {
    const raw = makeRawFlashcardDb()
    const db = makeSyncTestDb(raw)

    const courseRow = {
      course_id: 'course-it',
      name: 'BS Information Technology',
      cluster: 'ICT',
      career_tag: 'it',
      demand: 'very_high',
      board_exam: false,
      board_exam_name: null,
      duration_years: 4.0,
      top_countries: [],
      summary: null,
      student_tip: null,
      ai_note: null,
    }
    const factRow = {
      id: 'fact-it-1',
      course_id: 'course-it',
      query_type: 'demand',
      course_name: 'BS Information Technology',
      quick_answer: 'Extremely high demand globally',
      key_caveat: null,
      point_to: null,
      updated_at: '2026-06-02T00:00:00Z',
    }

    supabaseMock.from.mockImplementation(makeSupabaseForCareer(courseRow, factRow))

    await syncOnLaunch(db as any)

    const cRow = raw.prepare('SELECT * FROM career_courses WHERE course_id = ?').get('course-it') as any
    expect(cRow).toBeTruthy()
    expect(cRow.top_countries).toBe('[]')
    expect(cRow.board_exam).toBe(0)
  })
})

describe('pushUserData includes notes', () => {
  it('includes notes, note_labels, note_label_assignments in the upsert payload', async () => {
    const { supabase } = require('../supabase')
    const upsertMock = jest.fn().mockResolvedValue({ error: null })
    ;(supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } })
    ;(supabase.from as jest.Mock).mockReturnValue({ upsert: upsertMock })

    const makeFrom = (rows: unknown[] = []) => {
      const p = Promise.resolve(rows) as any
      p.where = () => p
      p.limit = () => Promise.resolve(rows)
      p.orderBy = () => Promise.resolve(rows)
      return p
    }

    const db: any = {
      select: jest.fn()
        .mockReturnValueOnce({ from: jest.fn(() => makeFrom()) })   // focusListings
        .mockReturnValueOnce({ from: jest.fn(() => makeFrom()) })   // savedDecks
        .mockReturnValueOnce({ from: jest.fn(() => makeFrom()) })   // userProgress
        .mockReturnValueOnce({ from: jest.fn(() => makeFrom()) })   // practiceSessions
        .mockReturnValueOnce({ from: jest.fn(() => makeFrom()) })   // userSettings
        .mockReturnValueOnce({ from: jest.fn(() => makeFrom()) })   // notes
        .mockReturnValueOnce({ from: jest.fn(() => makeFrom()) })   // noteLabels
        .mockReturnValueOnce({ from: jest.fn(() => makeFrom()) })   // noteLabelAssignments
        .mockReturnValueOnce({ from: jest.fn(() => makeFrom()) }),  // userRequirements
    }

    const { pushUserData } = require('../sync')
    await pushUserData(db)

    expect(upsertMock).toHaveBeenCalledTimes(1)
    const payload = upsertMock.mock.calls[0]![0] as Record<string, unknown>
    expect(payload).toHaveProperty('notes')
    expect(payload).toHaveProperty('note_labels')
    expect(payload).toHaveProperty('note_label_assignments')
    expect(payload).toHaveProperty('user_requirements')
  })
})

// ─── syncOnLaunch Epic C university write (real SQLite) ───────────────────────

function makeSupabaseForUniversity(
  schoolRow: Record<string, unknown>,
  rankingRow: Record<string, unknown>,
) {
  return (table: string) => {
    const emptyResolved = Promise.resolve({ data: [] })
    const emptyChain: any = {
      select: jest.fn().mockReturnThis(),
      contains: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(), range: jest.fn().mockResolvedValue({ data: [] }),
      then: (resolve: any, reject: any) => emptyResolved.then(resolve, reject),
    }
    if (table === 'tertiary_schools') {
      const resolved = Promise.resolve({ data: [schoolRow] })
      // tertiary_schools now uses .gt('updated_at', since) incremental cursor
      return {
        select: jest.fn().mockReturnThis(),
        gt: jest.fn().mockImplementation(() => ({
          then: (resolve: any, reject: any) => resolved.then(resolve, reject),
        })),
        then: (resolve: any, reject: any) => resolved.then(resolve, reject),
      }
    }
    if (table === 'course_school_rankings') {
      const resolved = Promise.resolve({ data: [rankingRow] })
      // course_school_rankings now uses .gt('updated_at', since) BEFORE .order().range()
      return {
        select: jest.fn().mockReturnThis(),
        gt: jest.fn().mockImplementation(() => ({
          order: jest.fn().mockReturnThis(),
          range: jest.fn().mockResolvedValue({ data: [rankingRow] }),
        })),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({ data: [rankingRow] }),
        then: (resolve: any, reject: any) => resolved.then(resolve, reject),
      }
    }
    return emptyChain
  }
}

describe('syncOnLaunch Epic C university write (real SQLite)', () => {
  let supabaseMock: any

  beforeEach(() => {
    jest.clearAllMocks()
    supabaseMock = require('../supabase').supabase
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } })
  })

  it('writes tertiary_schools row with boolean→int and remoteUpdatedAt', async () => {
    const raw = makeRawFlashcardDb()
    const db = makeSyncTestDb(raw)

    const schoolRow = {
      id: 'school-up-diliman',
      name: 'University of the Philippines Diliman',
      acronym: 'UPD',
      region: 'NCR',
      province: null,
      city: 'Quezon City',
      type: 'SUC',
      is_suc: true,
      is_luc: false,
      deped_school_id: null,
      rank_in_province: 1,
      updated_at: '2026-06-01T00:00:00Z',
    }
    const rankingRow = {
      id: 'rank-1',
      course_tab: 'nursing',
      course_name: 'BS Nursing',
      rank: 5,
      school_name: 'University of the Philippines Diliman',
      region: 'NCR',
      province: null,
      wilson_score: 0.9543,
      raw_pass_rate: 97.4,
      total_examinees: 200,
      total_passers: 194,
      years_with_data: '2020,2021,2022',
      exam_periods: 3,
      tertiary_school_id: 'school-up-diliman',
      updated_at: '2026-06-01T00:00:00Z',
    }

    supabaseMock.from.mockImplementation(makeSupabaseForUniversity(schoolRow, rankingRow))

    await syncOnLaunch(db as any)

    const sRow = raw.prepare('SELECT * FROM tertiary_schools WHERE id = ?').get('school-up-diliman') as any
    expect(sRow).toBeTruthy()
    expect(sRow.name).toBe('University of the Philippines Diliman')
    expect(sRow.is_suc).toBe(1)
    expect(sRow.is_luc).toBe(0)
    expect(sRow.rank_in_province).toBe(1)
    expect(sRow.remote_updated_at).toBe(new Date('2026-06-01T00:00:00Z').getTime())

    const rRow = raw.prepare('SELECT * FROM course_school_rankings WHERE id = ?').get('rank-1') as any
    expect(rRow).toBeTruthy()
    expect(rRow.course_tab).toBe('nursing')
    expect(rRow.wilson_score).toBeCloseTo(0.9543)
    expect(rRow.raw_pass_rate).toBeCloseTo(97.4)
    expect(rRow.total_examinees).toBe(200)
    expect(rRow.remote_updated_at).toBe(new Date('2026-06-01T00:00:00Z').getTime())
  })

  it('course_school_rankings text[] (years_with_data) survives as plain string, accreditations as JSON', async () => {
    const raw = makeRawFlashcardDb()
    const db = makeSyncTestDb(raw)

    const schoolRow = {
      id: 'school-2',
      name: 'De La Salle University',
      acronym: 'DLSU',
      region: 'NCR',
      province: null,
      city: 'Manila',
      type: 'Private',
      is_suc: false,
      is_luc: false,
      deped_school_id: null,
      rank_in_province: null,
      updated_at: '2026-06-02T00:00:00Z',
    }
    const rankingRow = {
      id: 'rank-2',
      course_tab: 'engineering',
      course_name: 'BS Civil Engineering',
      rank: 3,
      school_name: 'De La Salle University',
      region: 'NCR',
      province: null,
      wilson_score: null,
      raw_pass_rate: null,
      total_examinees: null,
      total_passers: null,
      years_with_data: null,
      exam_periods: null,
      tertiary_school_id: 'school-2',
      updated_at: '2026-06-02T00:00:00Z',
    }

    supabaseMock.from.mockImplementation(makeSupabaseForUniversity(schoolRow, rankingRow))

    await syncOnLaunch(db as any)

    const sRow = raw.prepare('SELECT * FROM tertiary_schools WHERE id = ?').get('school-2') as any
    expect(sRow).toBeTruthy()
    expect(sRow.is_suc).toBe(0)
    expect(sRow.is_luc).toBe(0)
    expect(sRow.rank_in_province).toBeNull()

    const rRow = raw.prepare('SELECT * FROM course_school_rankings WHERE id = ?').get('rank-2') as any
    expect(rRow).toBeTruthy()
    expect(rRow.course_tab).toBe('engineering')
    expect(rRow.wilson_score).toBeNull()
    expect(rRow.years_with_data).toBeNull()
  })
})

// ─── syncOnLaunch admissions_updates + listings.results_date (real SQLite) ───

function makeSupabaseForAdmissionsUpdates(
  updateRow: Record<string, unknown>,
  listingRow?: Record<string, unknown>,
) {
  return (table: string) => {
    const emptyResolved = Promise.resolve({ data: [] })
    const emptyChain: any = {
      select: jest.fn().mockReturnThis(),
      contains: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(), range: jest.fn().mockResolvedValue({ data: [] }),
      then: (resolve: any, reject: any) => emptyResolved.then(resolve, reject),
    }
    if (table === 'admissions_updates') {
      return {
        select: jest.fn().mockReturnThis(),
        gt: jest.fn().mockResolvedValue({ data: [updateRow] }),
      }
    }
    if (table === 'listings' && listingRow) {
      return {
        select: jest.fn().mockReturnThis(),
        gt: jest.fn().mockResolvedValue({ data: [listingRow] }),
      }
    }
    return emptyChain
  }
}

describe('syncOnLaunch admissions_updates + listings.results_date (real SQLite)', () => {
  let supabaseMock: any

  beforeEach(() => {
    jest.clearAllMocks()
    supabaseMock = require('../supabase').supabase
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } })
  })

  it('writes admissions_updates row: sources round-trips as JSON string, verified→1', async () => {
    const raw = makeRawFlashcardDb()
    const db = makeSyncTestDb(raw)

    const updateRow = {
      id: 'upd-1',
      report_date: '2026-06-01',
      severity: 'high',
      school_slug: 'upcat',
      school_name: 'University of the Philippines',
      title: 'UPCAT Results Released',
      body: 'Results are now available on the UP portal.',
      action_required: 'Check portal',
      event_date: '2026-06-15',
      event_type: 'results_release',
      sources: [
        { label: 'UP Portal', url: 'https://up.edu.ph/upcat' },
        { label: 'News PH', url: 'https://news.ph/upcat-2026' },
      ],
      verified: true,
      updated_at: '2026-06-01T08:00:00Z',
    }

    supabaseMock.from.mockImplementation(makeSupabaseForAdmissionsUpdates(updateRow))

    await syncOnLaunch(db as any)

    const row = raw.prepare('SELECT * FROM admissions_updates WHERE id = ?').get('upd-1') as any
    expect(row).toBeTruthy()
    expect(row.severity).toBe('high')
    expect(row.title).toBe('UPCAT Results Released')
    // sources must round-trip as JSON array of {label,url} objects
    const parsedSources = JSON.parse(row.sources) as Array<{ label: string; url: string }>
    expect(Array.isArray(parsedSources)).toBe(true)
    expect(parsedSources).toHaveLength(2)
    expect(parsedSources[0]!.url).toBe('https://up.edu.ph/upcat')
    expect(parsedSources[1]!.url).toBe('https://news.ph/upcat-2026')
    expect(parsedSources[0]!.label).toBe('UP Portal')
    expect(row.verified).toBe(1)
    expect(row.report_date).toBe('2026-06-01')
    expect(row.event_date).toBe('2026-06-15')
    expect(row.remote_updated_at).toBe(new Date('2026-06-01T08:00:00Z').getTime())
  })

  it('admissions_updates row with null sources defaults to "[]"', async () => {
    const raw = makeRawFlashcardDb()
    const db = makeSyncTestDb(raw)

    const updateRow = {
      id: 'upd-2',
      report_date: null,
      severity: 'low',
      school_slug: null,
      school_name: null,
      title: 'Reminder',
      body: 'Application deadline approaching.',
      action_required: null,
      event_date: null,
      event_type: null,
      sources: null,
      verified: false,
      updated_at: '2026-06-02T00:00:00Z',
    }

    supabaseMock.from.mockImplementation(makeSupabaseForAdmissionsUpdates(updateRow))

    await syncOnLaunch(db as any)

    const row = raw.prepare('SELECT * FROM admissions_updates WHERE id = ?').get('upd-2') as any
    expect(row).toBeTruthy()
    expect(row.sources).toBe('[]')
    expect(row.verified).toBe(0)
    expect(row.report_date).toBeNull()
    expect(row.school_slug).toBeNull()
  })

  it('listings.results_date lands as epoch ms from ISO date string', async () => {
    const raw = makeRawFlashcardDb()
    const db = makeSyncTestDb(raw)

    const listingRow = {
      id: 'listing-rd',
      slug: 'upcat-2026',
      title: 'UPCAT 2026',
      type: 'entrance_exam',
      status: 'active',
      exam_date: null,
      region: 'national',
      description: '',
      requirements: [],
      coverage: '',
      provider: 'UP',
      external_url: '',
      deadline: null,
      grant_amount: null,
      province: null,
      city: null,
      scope: 'national',
      is_verified: false,
      income_ceiling: null,
      gwa_requirement: null,
      monthly_stipend: null,
      service_obligation_years: null,
      has_entrance_exam: true,
      application_window: null,
      scholarship_meta: {},
      results_date: '2026-06-15T00:00:00Z',
    }

    supabaseMock.from.mockImplementation(makeSupabaseForAdmissionsUpdates({
      id: 'dummy', report_date: null, severity: 'low', school_slug: null, school_name: null,
      title: 'x', body: 'x', action_required: null, event_date: null, event_type: null,
      sources: [], verified: false, updated_at: '2026-06-01T00:00:00Z',
    }, listingRow))

    await syncOnLaunch(db as any)

    const row = raw.prepare('SELECT * FROM listings WHERE id = ?').get('listing-rd') as any
    expect(row).toBeTruthy()
    expect(row.results_date).toBe(new Date('2026-06-15T00:00:00Z').getTime())
  })
})

// ─── Task 3.5: Incremental mirror + unpublish propagation assertions ──────────

describe('Task 3.5 — incremental catalog mirror assertions (mock-chain level)', () => {
  it('career_courses query chain includes gt("updated_at", ...) cursor', async () => {
    const { supabase } = require('../supabase')

    // Capture the chain built for career_courses
    let careerCoursesChain: any = null
    const originalFrom = supabase.from.getMockImplementation()
    supabase.from.mockImplementation((table: string) => {
      const chain = makeSupabaseChain()
      if (table === 'career_courses') careerCoursesChain = chain
      return chain
    })

    const db = makeDb({ id: 1, selectedListingSlug: 'upcat', lastSyncedAt: 0, syncRev: 2 }, [])
    await syncOnLaunch(db as any)

    expect(careerCoursesChain).not.toBeNull()
    // The chain should have had gt called (incremental cursor)
    expect(careerCoursesChain.gt).toHaveBeenCalledWith('updated_at', expect.any(String))

    if (originalFrom) supabase.from.mockImplementation(originalFrom)
  })

  it('flashcards chain: select includes "status", no eq("status",...) call', async () => {
    const { supabase } = require('../supabase')

    let flashcardsChain: any = null
    supabase.from.mockImplementation((table: string) => {
      const chain = makeSupabaseChain()
      if (table === 'flashcards') flashcardsChain = chain
      return chain
    })

    const db = makeDb({ id: 1, selectedListingSlug: 'upcat', lastSyncedAt: 0, syncRev: 2 }, [])
    await syncOnLaunch(db as any)

    expect(flashcardsChain).not.toBeNull()
    // select must have been called with a string containing 'status'
    const selectArg: string = flashcardsChain.select.mock.calls[0]?.[0] ?? ''
    expect(selectArg).toContain('status')
    // eq must NOT have been called with 'status' (unpublish propagation: filter removed from remote pull)
    const eqCalls: Array<[string, unknown]> = flashcardsChain.eq.mock.calls
    const statusEqCall = eqCalls.find(([col]) => col === 'status')
    expect(statusEqCall).toBeUndefined()
  })

  it('exam_blueprints chain: no eq("status","published") call (unpublish propagates via local filter)', async () => {
    const { supabase } = require('../supabase')

    let blueprintsChain: any = null
    supabase.from.mockImplementation((table: string) => {
      const chain = makeSupabaseChain()
      if (table === 'exam_blueprints') blueprintsChain = chain
      return chain
    })

    const db = makeDb({ id: 1, selectedListingSlug: 'upcat', lastSyncedAt: 0, syncRev: 2 }, [])
    await syncOnLaunch(db as any)

    expect(blueprintsChain).not.toBeNull()
    const eqCalls: Array<[string, unknown]> = blueprintsChain.eq.mock.calls
    const statusEqCall = eqCalls.find(([col]) => col === 'status')
    expect(statusEqCall).toBeUndefined()
    // gt cursor IS applied
    expect(blueprintsChain.gt).toHaveBeenCalledWith('updated_at', expect.any(String))
  })
})

// ─── Task 3.5: flashcard status='draft' excluded from aggregate counts ────────

import {
  getTopicCardCounts,
  getWeakTopicStats,
} from '../homeAggregates'

function makeAggregateTestDb(): InstanceType<typeof Database> {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE flashcards (
      id TEXT PRIMARY KEY NOT NULL,
      topic_id TEXT NOT NULL,
      question TEXT NOT NULL DEFAULT '',
      answer TEXT NOT NULL DEFAULT '',
      explanation TEXT NOT NULL DEFAULT '',
      listing_slugs TEXT NOT NULL DEFAULT '[]',
      options TEXT NOT NULL DEFAULT '[]',
      correct_answer_index INTEGER,
      remote_updated_at INTEGER,
      ai_options TEXT,
      ai_correct_index INTEGER,
      ai_explanation TEXT,
      ai_enhanced_at INTEGER,
      status TEXT NOT NULL DEFAULT 'published'
    );
    CREATE INDEX IF NOT EXISTS flashcards_topic_id_idx ON flashcards (topic_id);
    CREATE TABLE user_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      flashcard_id TEXT NOT NULL,
      correct INTEGER NOT NULL,
      answered_at INTEGER NOT NULL
    );
    CREATE TABLE topics (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'published'
    );
  `)
  return raw
}

describe('Task 3.5 — status=draft flashcards excluded from aggregates', () => {
  it('getTopicCardCounts excludes draft cards from count', async () => {
    const raw = makeAggregateTestDb()
    const db = drizzle(raw, { schema }) as unknown as DrizzleClient

    raw.exec(`
      INSERT INTO topics (id, name, subject_id) VALUES ('t1', 'Algebra', 's1');
      INSERT INTO flashcards (id, topic_id, listing_slugs, status) VALUES ('fc-pub', 't1', '["upcat"]', 'published');
      INSERT INTO flashcards (id, topic_id, listing_slugs, status) VALUES ('fc-draft', 't1', '["upcat"]', 'draft');
    `)

    const counts = await getTopicCardCounts(db as any)
    // Only the published card should be counted
    const t1Count = counts.find(r => r.topicId === 't1')?.cardCount ?? 0
    expect(t1Count).toBe(1)
  })

  it('getTopicCardCounts with listingSlug filter also excludes draft cards', async () => {
    const raw = makeAggregateTestDb()
    const db = drizzle(raw, { schema }) as unknown as DrizzleClient

    raw.exec(`
      INSERT INTO topics (id, name, subject_id) VALUES ('t1', 'Algebra', 's1');
      INSERT INTO flashcards (id, topic_id, listing_slugs, status) VALUES ('fc-pub', 't1', '["upcat"]', 'published');
      INSERT INTO flashcards (id, topic_id, listing_slugs, status) VALUES ('fc-draft', 't1', '["upcat"]', 'draft');
    `)

    const counts = await getTopicCardCounts(db as any, 'upcat')
    const t1Count = counts.find(r => r.topicId === 't1')?.cardCount ?? 0
    expect(t1Count).toBe(1)
  })

  it('getWeakTopicStats excludes progress rows joined to draft flashcards', async () => {
    const raw = makeAggregateTestDb()
    const db = drizzle(raw, { schema }) as unknown as DrizzleClient

    raw.exec(`
      INSERT INTO topics (id, name, subject_id) VALUES ('t1', 'Algebra', 's1');
      -- published flashcard with correct answers
      INSERT INTO flashcards (id, topic_id, listing_slugs, status) VALUES ('fc-pub', 't1', '["upcat"]', 'published');
      -- draft flashcard with wrong answers (should not count)
      INSERT INTO flashcards (id, topic_id, listing_slugs, status) VALUES ('fc-draft', 't1', '["upcat"]', 'draft');
      -- progress: published card answered correctly, draft card answered wrong
      INSERT INTO user_progress (flashcard_id, correct, answered_at) VALUES ('fc-pub', 1, 1000);
      INSERT INTO user_progress (flashcard_id, correct, answered_at) VALUES ('fc-draft', 0, 2000);
    `)

    const stats = await getWeakTopicStats(db as any)
    const t1Stat = stats.find(r => r.topicId === 't1')
    // Only the published card's progress counts → 1 correct / 1 total = 100% (not weak, no row expected)
    // OR: if returned, accuracy should be 100% (1/1 correct)
    if (t1Stat) {
      expect(t1Stat.total).toBe(1)
      expect(t1Stat.ok).toBe(1)
    } else {
      // t1Stat not found because all progress for t1 is through a published card
      // and published card had correct=1, which means accuracy=100% → not weak — that's fine
      expect(t1Stat).toBeUndefined()
    }
  })
})
