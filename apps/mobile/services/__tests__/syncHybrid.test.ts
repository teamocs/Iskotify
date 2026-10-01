/**
 * Batch C review — HYBRID cloud restore.
 *  - append-only logs MERGE (sessions, progress, attempts, srs) and attempts are re-pruned;
 *  - user-curated entities REPLACE local when the remote has data (deletes propagate);
 *  - queued local edits are flushed before the pull, so they are not reverted;
 *  - switching accounts wipes the previous user's data (catalog stays);
 *  - one malformed remote row never aborts the pull.
 * Real SQLite (CREATE_SQL + MIGRATIONS) + a fake supabase that behaves like a backend:
 * upsert() stores the row, select().single() returns it.
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import {
  pullUserData, pushUserData, schedulePushUserData, reconcileAccountOwner, _resetPushSchedulerForTests,
} from '../sync'
import { _clearForTests } from '../queryCache'

const mockState: { remote: Record<string, unknown> | null; log: string[]; user: { id: string } | null } = {
  remote: null, log: [], user: { id: 'u1' },
}

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn(async () => ({ data: { user: mockState.user } })) },
    from: jest.fn(() => ({
      // The push reads the backup settings first (consent check): logged apart from the pull's select.
      select: (cols?: string) => ({
        eq: () => ({
          limit: () => ({
            single: async () => { mockState.log.push(cols === 'settings' ? 'consent-check' : 'select'); return { data: mockState.remote, error: null } },
          }),
        }),
      }),
      upsert: async (row: Record<string, unknown>) => {
        mockState.log.push('upsert')
        mockState.remote = row
        return { error: null }
      },
    })),
  },
}))
jest.mock('../questionReports', () => ({ pushPendingReports: jest.fn().mockResolvedValue(undefined) }))

function makeDb(pulled = true) {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup on re-run */ } }
  // A device that has already completed a pull for its owner (the normal returning-user state):
  // curated entities are REPLACED. A never-pulled device MERGES instead (see syncDataLoss.test.ts).
  if (pulled) raw.exec(`INSERT OR REPLACE INTO user_settings (id, last_pull_ok_at, owner_user_id) VALUES (1, 1, 'u1')`)
  return { raw, db: drizzle(raw, { schema }) as unknown as DrizzleClient }
}
const count = (raw: InstanceType<typeof Database>, t: string) =>
  (raw.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c

const session = (over: Record<string, unknown> = {}) => ({
  id: 1, listingSlug: 'upcat', topicId: '', deckId: '', score: 5, total: 10, durationSecs: 60,
  completedAt: 1_000, subtest: 'Math', kind: 'mock', attemptKey: 900, ...over,
})
const note = (id: string, title: string, updatedAt = 1) => ({
  id, title, content: 'y', type: 'text', isPinned: false, isArchived: false, isTrashed: false, createdAt: 1, updatedAt,
})

beforeEach(() => {
  mockState.remote = null
  mockState.log = []
  mockState.user = { id: 'u1' }
  _resetPushSchedulerForTests()
  _clearForTests()
})

describe('curated entities REPLACE local when the remote has data', () => {
  it('focus listings: remote replaces, then priorities are renumbered 0..n-1 (priority, addedAt, slug)', async () => {
    const { raw, db } = makeDb()
    raw.exec(`INSERT INTO focus_listings (listing_slug, priority, added_at) VALUES ('old', 0, 1)`)
    mockState.remote = {
      focus_listings: [
        { listingSlug: 'b', priority: 5, addedAt: 2 },
        { listingSlug: 'a', priority: 5, addedAt: 1 },
        { listingSlug: 'c', priority: 2, addedAt: 3 },
        { listingSlug: 'd', priority: 5, addedAt: 2 },
      ],
    }
    await pullUserData(db)
    const rows = raw.prepare(`SELECT listing_slug AS s, priority AS p FROM focus_listings ORDER BY priority`).all()
    expect(rows).toEqual([{ s: 'c', p: 0 }, { s: 'a', p: 1 }, { s: 'b', p: 2 }, { s: 'd', p: 3 }])
  })

  it('an EMPTY remote list does not wipe local curated data', async () => {
    const { raw, db } = makeDb()
    raw.exec(`INSERT INTO focus_listings (listing_slug, priority, added_at) VALUES ('mine', 0, 1)`)
    raw.exec(`INSERT INTO notes (id, title, content, created_at, updated_at) VALUES ('n', 'T', 'x', 1, 1)`)
    mockState.remote = { focus_listings: [], notes: [], saved_decks: [], user_requirements: [], study_plan_items: [] }
    await pullUserData(db)
    expect(count(raw, 'focus_listings')).toBe(1)
    expect(count(raw, 'notes')).toBe(1)
  })

  it('saved decks and requirements: a removed local entry is gone after the pull', async () => {
    const { raw, db } = makeDb()
    raw.exec(`INSERT INTO saved_decks (id, name, topic_ids, created_at) VALUES ('d-old', 'Old', '[]', 1)`)
    raw.exec(`INSERT INTO user_requirements (listing_slug, requirement_index, acquired_at) VALUES ('x', 0, 1), ('x', 1, 1)`)
    mockState.remote = {
      saved_decks: [{ id: 'd-new', name: 'New', topicIds: '["t1"]', createdAt: 2 }],
      user_requirements: [{ listingSlug: 'x', requirementIndex: 1, acquiredAt: 5 }],
    }
    await pullUserData(db)
    expect(raw.prepare(`SELECT id FROM saved_decks`).all()).toEqual([{ id: 'd-new' }])
    expect(raw.prepare(`SELECT requirement_index AS i FROM user_requirements`).all()).toEqual([{ i: 1 }])
  })

  it('labels and assignments are replaced, and assignments pointing at a replaced-away note are dropped', async () => {
    const { raw, db } = makeDb()
    raw.exec(`INSERT INTO notes (id, title, content, created_at, updated_at) VALUES ('gone', 'T', 'x', 1, 1)`)
    raw.exec(`INSERT INTO note_labels (id, name, created_at) VALUES ('l-old', 'Old', 1)`)
    raw.exec(`INSERT INTO note_label_assignments (note_id, label_id) VALUES ('gone', 'l-old')`)
    mockState.remote = {
      notes: [note('keep', 'K')],
      note_labels: [{ id: 'l-new', name: 'New', createdAt: 2 }],
      note_label_assignments: [{ noteId: 'keep', labelId: 'l-new' }],
    }
    await pullUserData(db)
    expect(raw.prepare(`SELECT id FROM note_labels`).all()).toEqual([{ id: 'l-new' }])
    expect(raw.prepare(`SELECT note_id AS n, label_id AS l FROM note_label_assignments`).all()).toEqual([{ n: 'keep', l: 'l-new' }])
  })

  it('settings: remote replaces local values, but an empty remote value never blanks a local one', async () => {
    const { raw, db } = makeDb()
    raw.exec(`INSERT OR REPLACE INTO user_settings (id, last_pull_ok_at, full_name, email, school) VALUES (1, 1, 'Juan', 'j@x.ph', 'PSHS')`)
    mockState.remote = { settings: { id: 1, fullName: 'Remote Juan', email: '', school: '', dailyReminderHour: 18 } }
    await pullUserData(db)
    const s = raw.prepare(`SELECT full_name AS n, email, school, daily_reminder_hour AS h FROM user_settings WHERE id=1`).get() as any
    expect(s).toEqual({ n: 'Remote Juan', email: 'j@x.ph', school: 'PSHS', h: 18 })
  })

  it('a failing curated replacement rolls back to the local rows (never half-replaced)', async () => {
    const { raw, db } = makeDb()
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    raw.exec(`INSERT INTO saved_decks (id, name, topic_ids, created_at) VALUES ('mine', 'Mine', '[]', 1)`)
    mockState.remote = { saved_decks: [{ id: 'ok', name: 'Ok', topicIds: '[]', createdAt: 1 }, { id: 'bad', name: null, topicIds: '[]', createdAt: 1 }] }
    await pullUserData(db)
    expect(raw.prepare(`SELECT id FROM saved_decks`).all()).toEqual([{ id: 'mine' }])
    warn.mockRestore()
  })
})

describe('append-only logs still merge, and attempts are re-pruned', () => {
  it('keeps the newest 5000 question_attempts after merging remote rows in', async () => {
    const { raw, db } = makeDb()
    raw.exec(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 4998)
      INSERT INTO question_attempts (session_key, source_table, question_id, correct_index, correct, answered_at)
      SELECT 1, 'upcat_questions', 'q' || i, 0, 1, 1000 + i FROM n`)
    mockState.remote = {
      question_attempts: Array.from({ length: 10 }, (_, i) => ({
        id: 9000 + i, sessionKey: 2, sourceTable: 'upcat_questions', questionId: `r${i}`, correctIndex: 0, correct: true,
        answeredAt: 50_000 + i, selectedIndex: 0, listingSlug: '', elapsedMs: 0,
      })),
    }
    await pullUserData(db)
    expect(count(raw, 'question_attempts')).toBe(5000)
    // the oldest local rows went, every remote (newest) row stayed
    expect(raw.prepare(`SELECT COUNT(*) AS c FROM question_attempts WHERE question_id LIKE 'r%'`).get()).toEqual({ c: 10 })
    expect(raw.prepare(`SELECT 1 FROM question_attempts WHERE question_id = 'q1'`).get()).toBeUndefined()
  })

  it('skips one malformed remote row (missing completedAt) instead of aborting the pull', async () => {
    const { raw, db } = makeDb()
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockState.remote = {
      practice_sessions: [session({ completedAt: undefined }), null, session({ completedAt: 2_000 })],
      user_progress: [{ id: 1, flashcardId: 'f1', correct: true }, { id: 2, flashcardId: 'f2', correct: true, answeredAt: 5 }],
      question_attempts: [
        { id: 1, sessionKey: 1, sourceTable: 's', questionId: 'bad', correct: true, answeredAt: 1 }, // no correctIndex
        { id: 2, sessionKey: 1, sourceTable: 's', questionId: 'good', correctIndex: 0, correct: true, answeredAt: 2 },
      ],
      flashcard_srs: [{ intervalDays: 1 }, { flashcardId: 'c', intervalDays: 2, lastReviewedAt: 3 }],
      focus_listings: [{ listingSlug: 'a', priority: 0, addedAt: 1 }],
    }
    await expect(pullUserData(db)).resolves.toBeUndefined()
    expect(raw.prepare(`SELECT completed_at AS c FROM practice_sessions`).all()).toEqual([{ c: 2000 }])
    expect(raw.prepare(`SELECT flashcard_id AS f FROM user_progress`).all()).toEqual([{ f: 'f2' }])
    expect(raw.prepare(`SELECT question_id AS q FROM question_attempts`).all()).toEqual([{ q: 'good' }])
    expect(raw.prepare(`SELECT flashcard_id AS f FROM flashcard_srs`).all()).toEqual([{ f: 'c' }])
    expect(count(raw, 'focus_listings')).toBe(1) // the rest of the pull still ran
    warn.mockRestore()
  })
})

describe('queued local edits are flushed BEFORE the pull', () => {
  it('a debounced edit reaches the backend first, so the pull does not revert it', async () => {
    const { raw, db } = makeDb()
    raw.exec(`INSERT OR REPLACE INTO user_settings (id, last_pull_ok_at, owner_user_id) VALUES (1, 1, 'u1')`)
    mockState.remote = { notes: [note('old', 'Old backup note')] }
    raw.exec(`INSERT INTO notes (id, title, content, created_at, updated_at) VALUES ('fresh', 'Just typed', 'x', 1, 2)`)
    schedulePushUserData(db) // 1.5 s debounce, not fired yet
    await pullUserData(db)
    expect(mockState.log.indexOf('upsert')).toBeGreaterThanOrEqual(0)
    expect(mockState.log.indexOf('upsert')).toBeLessThan(mockState.log.indexOf('select'))
    expect(raw.prepare(`SELECT id FROM notes WHERE id='fresh'`).get()).toEqual({ id: 'fresh' })
  })
})

describe('account switch', () => {
  function seedUserA(raw: InstanceType<typeof Database>) {
    raw.exec(`INSERT INTO listings (id, slug, title, type, status) VALUES ('L1', 'upcat', 'UPCAT', 'exam', 'open')`)
    raw.exec(`INSERT INTO practice_sessions (listing_slug, score, total, completed_at) VALUES ('upcat', 5, 10, 1)`)
    raw.exec(`INSERT INTO user_progress (flashcard_id, correct, answered_at) VALUES ('f', 1, 1)`)
    raw.exec(`INSERT INTO question_attempts (session_key, source_table, question_id, correct_index, correct, answered_at) VALUES (1, 's', 'q', 0, 1, 1)`)
    raw.exec(`INSERT INTO flashcard_srs (flashcard_id) VALUES ('f')`)
    raw.exec(`INSERT INTO notes (id, title, content, created_at, updated_at) VALUES ('n', 'A note', 'x', 1, 1)`)
    raw.exec(`INSERT INTO note_labels (id, name, created_at) VALUES ('l', 'L', 1)`)
    raw.exec(`INSERT INTO note_label_assignments (note_id, label_id) VALUES ('n', 'l')`)
    raw.exec(`INSERT INTO study_plan_items (plan_date, kind, ref_id, created_at) VALUES ('2026-10-01', 'srs_review', '', 1)`)
    raw.exec(`INSERT INTO focus_listings (listing_slug, priority, added_at) VALUES ('upcat', 0, 1)`)
    raw.exec(`INSERT INTO saved_decks (id, name, topic_ids, created_at) VALUES ('d', 'D', '[]', 1)`)
    raw.exec(`INSERT INTO user_requirements (listing_slug, requirement_index, acquired_at) VALUES ('upcat', 0, 1)`)
    raw.exec(`INSERT INTO exam_runs (run_key, kind, started_at, updated_at) VALUES ('rk', 'exam', 1, 1)`)
    raw.exec(`INSERT OR REPLACE INTO user_settings (id, last_pull_ok_at, full_name, email, google_id, school, selected_listing_slug, last_synced_at, sync_rev, owner_user_id)
      VALUES (1, 1, 'Alice', 'a@x.ph', 'A', 'PSHS', 'upcat', 12345, 2, 'A')`)
  }
  const USER_TABLES = [
    'practice_sessions', 'user_progress', 'question_attempts', 'flashcard_srs', 'notes', 'note_labels',
    'note_label_assignments', 'study_plan_items', 'focus_listings', 'saved_decks', 'user_requirements', 'exam_runs',
  ]

  it('signing in as a different user wipes every user table but keeps the catalog and sync cursor', async () => {
    const { raw, db } = makeDb()
    seedUserA(raw)
    mockState.user = { id: 'B' }
    mockState.remote = null // B has no backup
    await pullUserData(db)
    for (const t of USER_TABLES) expect([t, count(raw, t)]).toEqual([t, 0])
    expect(count(raw, 'listings')).toBe(1)
    const s = raw.prepare(`SELECT full_name AS n, email, google_id AS g, school, selected_listing_slug AS slug,
      last_synced_at AS cursor, sync_rev AS rev, owner_user_id AS owner FROM user_settings WHERE id=1`).get() as any
    expect(s).toEqual({ n: '', email: null, g: null, school: '', slug: '', cursor: 12345, rev: 2, owner: 'B' })
  })

  it('then restores the new account from its own backup', async () => {
    const { raw, db } = makeDb()
    seedUserA(raw)
    mockState.user = { id: 'B' }
    mockState.remote = { practice_sessions: [session({ completedAt: 777 })], settings: { id: 1, fullName: 'Bob' } }
    await pullUserData(db)
    expect(raw.prepare(`SELECT completed_at AS c FROM practice_sessions`).all()).toEqual([{ c: 777 }])
    expect((raw.prepare(`SELECT full_name AS n FROM user_settings WHERE id=1`).get() as any).n).toBe('Bob')
  })

  it('anonymous -> first sign-in (no stored owner) keeps local data, merges, and records the owner', async () => {
    const { raw, db } = makeDb(false)
    raw.exec(`INSERT INTO practice_sessions (listing_slug, score, total, completed_at) VALUES ('upcat', 7, 10, 5000)`)
    raw.exec(`INSERT OR REPLACE INTO user_settings (id, last_pull_ok_at, full_name) VALUES (1, 0, 'Anon')`)
    mockState.remote = { practice_sessions: [session()] }
    await pullUserData(db)
    expect(count(raw, 'practice_sessions')).toBe(2)
    expect((raw.prepare(`SELECT owner_user_id AS o FROM user_settings WHERE id=1`).get() as any).o).toBe('u1')
  })

  it('the same user signing in again keeps their data', async () => {
    const { raw, db } = makeDb()
    seedUserA(raw)
    mockState.user = { id: 'A' }
    mockState.remote = null
    await pullUserData(db)
    expect(count(raw, 'practice_sessions')).toBe(1)
    expect(count(raw, 'notes')).toBe(1)
  })

  it('reconcileAccountOwner reports what it did', async () => {
    const { raw, db } = makeDb(false)
    expect(await reconcileAccountOwner(db, 'A')).toBe('claimed')
    expect(await reconcileAccountOwner(db, 'A')).toBe('same')
    raw.exec(`INSERT INTO notes (id, title, content, created_at, updated_at) VALUES ('n', 'x', 'x', 1, 1)`)
    expect(await reconcileAccountOwner(db, 'B')).toBe('switched')
    expect(count(raw, 'notes')).toBe(0)
  })

  it("a queued push of the previous user's data is dropped, never sent to the new account", async () => {
    const { raw, db } = makeDb()
    seedUserA(raw)
    schedulePushUserData(db)
    mockState.user = { id: 'B' }
    await pullUserData(db)
    expect(mockState.log).not.toContain('upsert')
  })

  it("pushUserData refuses to upload another account's local data", async () => {
    const { raw, db } = makeDb()
    seedUserA(raw)
    mockState.user = { id: 'B' }
    expect(await pushUserData(db)).toBe(false)
    expect(mockState.log).not.toContain('upsert')
  })

  it('pushUserData claims an unowned database for the signed-in user', async () => {
    const { raw, db } = makeDb()
    raw.exec(`INSERT OR REPLACE INTO user_settings (id, last_pull_ok_at) VALUES (1, 1)`)
    expect(await pushUserData(db)).toBe(true)
    expect((raw.prepare(`SELECT owner_user_id AS o FROM user_settings WHERE id=1`).get() as any).o).toBe('u1')
  })
})
