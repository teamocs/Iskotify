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
  const resolved = Promise.resolve({ data })
  const chain: any = {
    select: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockResolvedValue({ data }),
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
      score_disclaimer_ack INTEGER NOT NULL DEFAULT 0
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
          saved_listings: [],
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
          saved_listings: [],
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
      ai_enhanced_at INTEGER
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
      scholarship_meta TEXT NOT NULL DEFAULT '{}'
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
      score_disclaimer_ack INTEGER NOT NULL DEFAULT 0
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
    limit: jest.fn().mockResolvedValue([{ id: 1, selectedListingSlug: slug, lastSyncedAt: 0 }]),
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
      gt: jest.fn().mockResolvedValue({ data: [] }),
      then: (resolve: any, reject: any) => emptyResolved.then(resolve, reject),
    }
    if (table === 'flashcards') {
      return {
        select: jest.fn().mockReturnThis(),
        contains: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gt: jest.fn().mockResolvedValue({ data: [cardRow] }),
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
      gt: jest.fn().mockResolvedValue({ data: [] }),
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
        gt: jest.fn().mockResolvedValue({ data: [questionRow] }),
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
      gt: jest.fn().mockResolvedValue({ data: [] }),
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
      gt: jest.fn().mockResolvedValue({ data: [] }),
      then: (resolve: any, reject: any) => emptyResolved.then(resolve, reject),
    }
    if (table === 'upcat_cutoffs') {
      const resolved = Promise.resolve({ data: [cutoffRow] })
      return {
        select: jest.fn().mockReturnThis(),
        then: (resolve: any, reject: any) => resolved.then(resolve, reject),
      }
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
        .mockReturnValueOnce({ from: jest.fn(() => makeFrom()) })   // savedListings
        .mockReturnValueOnce({ from: jest.fn(() => makeFrom()) })   // savedDecks
        .mockReturnValueOnce({ from: jest.fn(() => makeFrom()) })   // userProgress
        .mockReturnValueOnce({ from: jest.fn(() => makeFrom()) })   // practiceSessions
        .mockReturnValueOnce({ from: jest.fn(() => makeFrom()) })   // userSettings
        .mockReturnValueOnce({ from: jest.fn(() => makeFrom()) })   // notes
        .mockReturnValueOnce({ from: jest.fn(() => makeFrom()) })   // noteLabels
        .mockReturnValueOnce({ from: jest.fn(() => makeFrom()) }),  // noteLabelAssignments
    }

    const { pushUserData } = require('../sync')
    await pushUserData(db)

    expect(upsertMock).toHaveBeenCalledTimes(1)
    const payload = upsertMock.mock.calls[0]![0] as Record<string, unknown>
    expect(payload).toHaveProperty('notes')
    expect(payload).toHaveProperty('note_labels')
    expect(payload).toHaveProperty('note_label_assignments')
  })
})
