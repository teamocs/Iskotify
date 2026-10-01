/**
 * C1/C2 — pullUserData MERGES the cloud backup into the local DB (never wipes
 * local rows), and pushUserData is checked + coalesced. Real SQLite (CREATE_SQL
 * + MIGRATIONS) with a fake supabase.
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { pullUserData, pushUserData, schedulePushUserData, _resetPushSchedulerForTests } from '../sync'
import { cachedQuery, _clearForTests } from '../queryCache'

const mockState: { remote: Record<string, unknown> | null; upsert: jest.Mock; user: { id: string } | null } = {
  remote: null,
  upsert: jest.fn(),
  user: { id: 'u1' },
}

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn(async () => ({ data: { user: mockState.user } })) },
    from: jest.fn(() => ({
      select: () => ({ eq: () => ({ limit: () => ({ single: async () => ({ data: mockState.remote, error: null }) }) }) }),
      upsert: (...a: unknown[]) => mockState.upsert(...a),
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

beforeEach(() => {
  mockState.remote = null
  mockState.user = { id: 'u1' }
  mockState.upsert = jest.fn().mockResolvedValue({ error: null })
  _clearForTests()
})

describe('pullUserData merge (C1)', () => {
  it('keeps a local session that has not been pushed yet', async () => {
    const { raw, db } = makeDb()
    raw.exec(`INSERT INTO practice_sessions (listing_slug, score, total, completed_at) VALUES ('upcat', 7, 10, 5000)`)
    mockState.remote = { practice_sessions: [session()] }
    await pullUserData(db)
    expect(count(raw, 'practice_sessions')).toBe(2)
    expect(raw.prepare(`SELECT 1 FROM practice_sessions WHERE completed_at = 5000`).get()).toBeTruthy()
  })

  it('adds remote-only rows and keeps kind + attempt_key', async () => {
    const { raw, db } = makeDb()
    mockState.remote = { practice_sessions: [session()] }
    await pullUserData(db)
    const r = raw.prepare(`SELECT kind, attempt_key AS k, subtest FROM practice_sessions`).get() as any
    expect(r).toEqual({ kind: 'mock', k: 900, subtest: 'Math' })
  })

  it('does not duplicate identical rows and is idempotent across pulls', async () => {
    const { raw, db } = makeDb()
    raw.exec(`INSERT INTO practice_sessions (listing_slug, topic_id, deck_id, subtest, score, total, completed_at)
      VALUES ('upcat', '', '', 'Math', 5, 10, 1000)`)
    raw.exec(`INSERT INTO user_progress (flashcard_id, correct, answered_at) VALUES ('f1', 1, 10)`)
    raw.exec(`INSERT INTO question_attempts (session_key, source_table, question_id, correct_index, correct, answered_at, selected_index)
      VALUES (900, 'upcat_questions', 'q1', 0, 1, 20, 0)`)
    mockState.remote = {
      practice_sessions: [session(), session({ completedAt: 2_000 })],
      user_progress: [
        { id: 7, flashcardId: 'f1', correct: true, answeredAt: 10 },
        { id: 8, flashcardId: 'f2', correct: false, answeredAt: 11 },
      ],
      question_attempts: [
        { id: 3, sessionKey: 900, sourceTable: 'upcat_questions', questionId: 'q1', correctIndex: 0, correct: true, answeredAt: 20, selectedIndex: 0, listingSlug: '', elapsedMs: 0 },
        { id: 4, sessionKey: 900, sourceTable: 'upcat_questions', questionId: 'q2', correctIndex: 1, correct: false, answeredAt: 21, selectedIndex: 0, listingSlug: '', elapsedMs: 0 },
      ],
    }
    await pullUserData(db)
    await pullUserData(db)
    expect(count(raw, 'practice_sessions')).toBe(2)
    expect(count(raw, 'user_progress')).toBe(2)
    expect(count(raw, 'question_attempts')).toBe(2)
  })

  it('flashcard_srs keeps the later review', async () => {
    const { raw, db } = makeDb()
    raw.exec(`INSERT INTO flashcard_srs (flashcard_id, interval_days, last_reviewed_at) VALUES ('a', 6, 9000), ('b', 1, 100)`)
    mockState.remote = {
      flashcard_srs: [
        { flashcardId: 'a', intervalDays: 1, easeFactor: 2.5, repetitions: 1, lapses: 0, dueAt: 1, lastReviewedAt: 500, lastGrade: 'good' },
        { flashcardId: 'b', intervalDays: 10, easeFactor: 2.5, repetitions: 3, lapses: 0, dueAt: 2, lastReviewedAt: 800, lastGrade: 'easy' },
        { flashcardId: 'c', intervalDays: 2, easeFactor: 2.5, repetitions: 1, lapses: 0, dueAt: 3, lastReviewedAt: 300, lastGrade: 'good' },
      ],
    }
    await pullUserData(db)
    const get = (id: string) => raw.prepare(`SELECT interval_days AS i FROM flashcard_srs WHERE flashcard_id = ?`).get(id) as any
    expect(get('a').i).toBe(6)
    expect(get('b').i).toBe(10)
    expect(get('c').i).toBe(2)
  })

  it('study plan items are a curated list: a non-empty remote replaces local (no merge)', async () => {
    const { raw, db } = makeDb()
    raw.exec(`INSERT INTO study_plan_items (plan_date, kind, ref_id, created_at) VALUES ('2026-09-30', 'srs_review', '', 1), ('2026-09-30', 'topic_practice', 'local-only', 1)`)
    mockState.remote = {
      study_plan_items: [
        { id: 5, planDate: '2026-09-30', kind: 'srs_review', refId: '', targetCount: 1, completedAt: 99, createdAt: 1 },
        { id: 6, planDate: '2026-09-30', kind: 'topic_practice', refId: 't1', targetCount: 5, completedAt: null, createdAt: 1 },
      ],
    }
    await pullUserData(db)
    await pullUserData(db)
    expect(count(raw, 'study_plan_items')).toBe(2)
    expect(raw.prepare(`SELECT 1 FROM study_plan_items WHERE ref_id='local-only'`).get()).toBeUndefined()
    expect((raw.prepare(`SELECT completed_at AS c FROM study_plan_items WHERE kind='srs_review'`).get() as any).c).toBe(99)
  })

  it('notes are a curated list: remote replaces local, so a delete made on another device propagates', async () => {
    const { raw, db } = makeDb()
    raw.exec(`INSERT INTO notes (id, title, content, created_at, updated_at) VALUES
      ('deleted-elsewhere', 'L', 'x', 1, 1), ('both', 'old-local', 'x', 1, 5)`)
    const n = (id: string, title: string, updatedAt: number) => ({ id, title, content: 'y', type: 'text', isPinned: false, isArchived: false, isTrashed: false, createdAt: 1, updatedAt })
    mockState.remote = { notes: [n('both', 'remote-title', 10), n('remote', 'R', 1)] }
    await pullUserData(db)
    const t = (id: string) => (raw.prepare(`SELECT title FROM notes WHERE id=?`).get(id) as any)?.title
    expect(t('deleted-elsewhere')).toBeUndefined()
    expect(t('both')).toBe('remote-title')
    expect(t('remote')).toBe('R')
  })

  it('does not blank local settings with empty remote values', async () => {
    const { raw, db } = makeDb()
    raw.exec(`INSERT OR REPLACE INTO user_settings (id, last_pull_ok_at, full_name, email, school) VALUES (1, 1, 'Juan', 'j@x.ph', 'PSHS')`)
    mockState.remote = { settings: { id: 1, fullName: '', email: '', school: '' } }
    await pullUserData(db)
    const s = raw.prepare(`SELECT full_name AS n, email, school FROM user_settings WHERE id=1`).get() as any
    expect(s).toEqual({ n: 'Juan', email: 'j@x.ph', school: 'PSHS' })
  })

  it('invalidates query caches after the pull', async () => {
    const { db } = makeDb()
    let n = 0
    const fetcher = async () => ++n
    expect(await cachedQuery('home:x', 60000, fetcher)).toBe(1)
    mockState.remote = { practice_sessions: [session()] }
    await pullUserData(db)
    expect(await cachedQuery('home:x', 60000, fetcher)).toBe(2)
  })
})

describe('pushUserData (C2)', () => {
  it('returns false and warns when the upsert errors', async () => {
    const { db } = makeDb()
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockState.upsert = jest.fn().mockResolvedValue({ error: { message: 'boom' } })
    expect(await pushUserData(db)).toBe(false)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('returns true on success', async () => {
    const { db } = makeDb()
    expect(await pushUserData(db)).toBe(true)
  })

  describe('schedulePushUserData', () => {
    beforeEach(() => { jest.useFakeTimers(); _resetPushSchedulerForTests() })
    afterEach(() => { jest.useRealTimers() })

    it('coalesces rapid calls into one push of the latest state', async () => {
      const { raw, db } = makeDb()
      schedulePushUserData(db)
      raw.exec(`INSERT INTO practice_sessions (listing_slug, score, total, completed_at) VALUES ('upcat', 1, 2, 1)`)
      schedulePushUserData(db)
      raw.exec(`INSERT INTO practice_sessions (listing_slug, score, total, completed_at) VALUES ('upcat', 1, 2, 2)`)
      schedulePushUserData(db)
      expect(mockState.upsert).not.toHaveBeenCalled()
      await jest.advanceTimersByTimeAsync(2000)
      expect(mockState.upsert).toHaveBeenCalledTimes(1)
      expect(mockState.upsert.mock.calls[0][0].practice_sessions).toHaveLength(2)
    })

    it('pushes again for a later burst', async () => {
      const { db } = makeDb()
      schedulePushUserData(db)
      await jest.advanceTimersByTimeAsync(2000)
      schedulePushUserData(db)
      await jest.advanceTimersByTimeAsync(2000)
      expect(mockState.upsert).toHaveBeenCalledTimes(2)
    })
  })
})
