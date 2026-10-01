/**
 * Batch C data-loss review. Real SQLite (CREATE_SQL + MIGRATIONS) + a fake backend.
 *  1 durable unsynced marker (push_dirty_at) guards the pull-time REPLACE
 *  3 legacy owner evidence on upgraded devices
 *  4 anonymous -> first sign-in with an existing backup MERGES curated data
 *  5 push refuses to overwrite a populated backup from an empty never-pulled device
 *  6 concurrent pulls are serialized (no duplicate log rows)
 *  7 an account switch cancels the previous account's note reminders
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import {
  pullUserData, pushUserData, schedulePushUserData, reconcileAccountOwner, PUSH_DEBOUNCE_MS, _resetPushSchedulerForTests,
} from '../sync'
import { _clearForTests } from '../queryCache'
import { getSyncStatus, resetSyncStatus } from '../syncStatus'

const mockState: {
  remote: Record<string, unknown> | null
  log: string[]
  user: { id: string; email?: string } | null
  upsertError: unknown
  selectDelayMs: number
  active: number
  maxActive: number
} = { remote: null, log: [], user: { id: 'u1' }, upsertError: null, selectDelayMs: 0, active: 0, maxActive: 0 }

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn(async () => ({ data: { user: mockState.user } })) },
    from: jest.fn(() => ({
      // The push reads the backup settings first (consent check): logged apart from the pull's select.
      select: (cols?: string) => ({
        eq: () => ({
          limit: () => ({
            single: async () => {
              mockState.log.push(cols === 'settings' ? 'consent-check' : 'select')
              mockState.active++
              mockState.maxActive = Math.max(mockState.maxActive, mockState.active)
              if (mockState.selectDelayMs) await new Promise(r => setTimeout(r, mockState.selectDelayMs))
              mockState.active--
              return mockState.remote
                ? { data: mockState.remote, error: null }
                : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
            },
          }),
        }),
      }),
      upsert: async (row: Record<string, unknown>) => {
        mockState.log.push('upsert')
        if (mockState.upsertError) return { error: mockState.upsertError }
        mockState.remote = row
        return { error: null }
      },
    })),
  },
}))
const mockCancelReminder = jest.fn().mockResolvedValue(undefined)
jest.mock('../notifications', () => ({ cancelNoteReminder: (id: string) => mockCancelReminder(id) }))
jest.mock('../questionReports', () => ({ pushPendingReports: jest.fn().mockResolvedValue(undefined) }))

function makeDb() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup */ } }
  return { raw, db: drizzle(raw, { schema }) as unknown as DrizzleClient }
}
type Raw = InstanceType<typeof Database>
const count = (raw: Raw, t: string) => (raw.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c
const setting = (raw: Raw, col: string) => (raw.prepare(`SELECT ${col} AS v FROM user_settings WHERE id=1`).get() as { v: unknown } | undefined)?.v
const note = (id: string, title: string, updatedAt = 1) => ({
  id, title, content: 'y', type: 'text', isPinned: false, isArchived: false, isTrashed: false, createdAt: 1, updatedAt,
})
const session = (over: Record<string, unknown> = {}) => ({
  id: 1, listingSlug: 'upcat', topicId: '', deckId: '', score: 5, total: 10, durationSecs: 60,
  completedAt: 1_000, subtest: 'Math', kind: 'mock', attemptKey: 900, ...over,
})
const own = (raw: Raw, id = 'u1') => raw.exec(`INSERT OR REPLACE INTO user_settings (id, owner_user_id, last_pull_ok_at) VALUES (1, '${id}', 1)`)

beforeEach(() => {
  Object.assign(mockState, { remote: null, log: [], user: { id: 'u1' }, upsertError: null, selectDelayMs: 0, active: 0, maxActive: 0 })
  mockCancelReminder.mockClear()
  _resetPushSchedulerForTests()
  _clearForTests()
})

describe('1. durable unsynced marker', () => {
  it('schedulePushUserData records push_dirty_at in the database', async () => {
    jest.useFakeTimers()
    try {
      const { raw, db } = makeDb()
      own(raw)
      schedulePushUserData(db)
      await jest.advanceTimersByTimeAsync(0)
      expect(Number(setting(raw, 'push_dirty_at'))).toBeGreaterThan(0)
      _resetPushSchedulerForTests()
    } finally { jest.useRealTimers() }
  })

  it('a successful push clears the marker; a failed one keeps it', async () => {
    const { raw, db } = makeDb()
    own(raw)
    raw.exec(`UPDATE user_settings SET push_dirty_at = 5 WHERE id = 1`)
    mockState.upsertError = { message: 'offline' }
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await pushUserData(db)).toBe(false)
    // Still unsynced (the attempt stamps it with its own time, never lowering it).
    expect(Number(setting(raw, 'push_dirty_at'))).toBeGreaterThanOrEqual(5)
    mockState.upsertError = null
    expect(await pushUserData(db)).toBe(true)
    expect(setting(raw, 'push_dirty_at')).toBe(0)
    warn.mockRestore()
  })

  it('an edit marked dirty WHILE a push is in flight stays dirty after that push lands', async () => {
    const { raw, db } = makeDb()
    own(raw)
    raw.exec(`UPDATE user_settings SET push_dirty_at = 5 WHERE id = 1`)
    const supa = require('../supabase').supabase
    const realFrom = supa.from.getMockImplementation()
    supa.from.mockImplementationOnce(() => ({
      // An edit during the upload marks dirty the way schedulePushUserData does:
      // max(now, previous + 1) — always later than the upload's own stamp.
      upsert: async () => { raw.exec(`UPDATE user_settings SET push_dirty_at = push_dirty_at + 1 WHERE id = 1`); return { error: null } },
    }))
    await pushUserData(db)
    expect(Number(setting(raw, 'push_dirty_at'))).toBeGreaterThan(0)
    supa.from.mockImplementation(realFrom)
  })

  it('after a reload (no in-memory state) a dirty device pushes BEFORE pulling, so local edits survive', async () => {
    const { raw, db } = makeDb()
    own(raw)
    raw.exec(`INSERT INTO notes (id, title, content, created_at, updated_at) VALUES ('fresh', 'typed offline', 'x', 1, 2)`)
    raw.exec(`UPDATE user_settings SET push_dirty_at = 7 WHERE id = 1`)
    mockState.remote = { notes: [note('stale', 'old backup')] }
    await pullUserData(db)
    expect(mockState.log.indexOf('upsert')).toBeGreaterThanOrEqual(0)
    expect(mockState.log.indexOf('upsert')).toBeLessThan(mockState.log.indexOf('select'))
    expect(raw.prepare(`SELECT id FROM notes`).all()).toEqual([{ id: 'fresh' }])
    expect(setting(raw, 'push_dirty_at')).toBe(0)
  })

  it('if that push fails, NO curated entity is replaced (logs still merge)', async () => {
    const { raw, db } = makeDb()
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    own(raw)
    raw.exec(`INSERT INTO notes (id, title, content, created_at, updated_at) VALUES ('fresh', 'typed offline', 'x', 1, 2)`)
    raw.exec(`INSERT INTO focus_listings (listing_slug, priority, added_at) VALUES ('mine', 0, 1)`)
    raw.exec(`UPDATE user_settings SET push_dirty_at = 7, full_name = 'Local Name' WHERE id = 1`)
    mockState.upsertError = { message: 'offline' }
    mockState.remote = {
      notes: [note('stale', 'old backup')],
      focus_listings: [{ listingSlug: 'other', priority: 0, addedAt: 1 }],
      saved_decks: [{ id: 'd', name: 'D', topicIds: '[]', createdAt: 1 }],
      settings: { id: 1, fullName: 'Remote Name' },
      practice_sessions: [session({ completedAt: 4242 })],
    }
    await pullUserData(db)
    expect(raw.prepare(`SELECT id FROM notes`).all()).toEqual([{ id: 'fresh' }])
    expect(raw.prepare(`SELECT listing_slug AS s FROM focus_listings`).all()).toEqual([{ s: 'mine' }])
    expect(count(raw, 'saved_decks')).toBe(0)
    expect(setting(raw, 'full_name')).toBe('Local Name')
    expect(raw.prepare(`SELECT completed_at AS c FROM practice_sessions`).all()).toEqual([{ c: 4242 }])
    expect(Number(setting(raw, 'push_dirty_at'))).toBeGreaterThan(0)
    warn.mockRestore()
  })

  it('a failed scheduled push stays dirty and the next schedule retries it', async () => {
    jest.useFakeTimers()
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { raw, db } = makeDb()
      own(raw)
      mockState.upsertError = { message: 'offline' }
      schedulePushUserData(db)
      await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 10)
      expect(Number(setting(raw, 'push_dirty_at'))).toBeGreaterThan(0)
      mockState.upsertError = null
      schedulePushUserData(db)
      await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS + 10)
      expect(setting(raw, 'push_dirty_at')).toBe(0)
    } finally { warn.mockRestore(); jest.useRealTimers() }
  })
})

describe('3. upgraded device (owner_user_id empty) uses legacy googleId / email as owner evidence', () => {
  const seedA = (raw: Raw, cols: string, vals: string) => {
    raw.exec(`INSERT INTO user_settings (id, ${cols}) VALUES (1, ${vals})`)
    raw.exec(`INSERT INTO notes (id, title, content, created_at, updated_at) VALUES ('n', 'A note', 'x', 1, 1)`)
  }

  it('same user (googleId matches) -> claimed, data kept', async () => {
    const { raw, db } = makeDb()
    seedA(raw, 'google_id', `'A'`)
    expect(await reconcileAccountOwner(db, 'A', 'a@x.ph')).toBe('claimed')
    expect(count(raw, 'notes')).toBe(1)
    expect(setting(raw, 'owner_user_id')).toBe('A')
  })

  it('different user (googleId differs) -> switched, data wiped', async () => {
    const { raw, db } = makeDb()
    seedA(raw, 'google_id', `'A'`)
    expect(await reconcileAccountOwner(db, 'B', 'b@x.ph')).toBe('switched')
    expect(count(raw, 'notes')).toBe(0)
    expect(setting(raw, 'owner_user_id')).toBe('B')
  })

  it('no googleId: a different email -> switched; the same email (any case) -> claimed', async () => {
    const a = makeDb()
    seedA(a.raw, 'email', `'Alice@X.ph'`)
    expect(await reconcileAccountOwner(a.db, 'B', 'bob@x.ph')).toBe('switched')
    expect(count(a.raw, 'notes')).toBe(0)
    const b = makeDb()
    seedA(b.raw, 'email', `'Alice@X.ph'`)
    expect(await reconcileAccountOwner(b.db, 'A', 'alice@x.ph')).toBe('claimed')
    expect(count(b.raw, 'notes')).toBe(1)
  })

  it('a truly anonymous device (no googleId, no email) -> claimed, data kept', async () => {
    const { raw, db } = makeDb()
    seedA(raw, 'full_name', `'Anon'`)
    expect(await reconcileAccountOwner(db, 'B', 'b@x.ph')).toBe('claimed')
    expect(count(raw, 'notes')).toBe(1)
  })
})

describe('4. anonymous -> first sign-in with an existing backup merges curated data', () => {
  it('keeps anonymous notes, labels, assignments, focus, decks, requirements and plan items alongside the backup, then pushes', async () => {
    const { raw, db } = makeDb()
    raw.exec(`INSERT INTO user_settings (id, full_name) VALUES (1, 'Anon')`)
    raw.exec(`INSERT INTO notes (id, title, content, created_at, updated_at) VALUES ('anon-note', 'Anon note', 'x', 1, 1)`)
    raw.exec(`INSERT INTO note_labels (id, name, created_at) VALUES ('l-study', 'Study', 1), ('l-shared-local', 'Shared', 1)`)
    raw.exec(`INSERT INTO note_label_assignments (note_id, label_id) VALUES ('anon-note', 'l-study'), ('anon-note', 'l-shared-local')`)
    raw.exec(`INSERT INTO focus_listings (listing_slug, priority, added_at) VALUES ('anon-focus', 0, 1)`)
    raw.exec(`INSERT INTO saved_decks (id, name, topic_ids, created_at) VALUES ('anon-deck', 'Anon deck', '[]', 1)`)
    raw.exec(`INSERT INTO user_requirements (listing_slug, requirement_index, acquired_at) VALUES ('x', 0, 1)`)
    raw.exec(`INSERT INTO study_plan_items (plan_date, kind, ref_id, created_at) VALUES ('2026-10-01', 'srs_review', '', 1)`)
    mockState.remote = {
      notes: [note('remote-note', 'Remote note')],
      note_labels: [{ id: 'l-shared-remote', name: 'Shared', createdAt: 1 }],
      note_label_assignments: [{ noteId: 'remote-note', labelId: 'l-shared-remote' }],
      focus_listings: [{ listingSlug: 'remote-focus', priority: 0, addedAt: 1 }],
      saved_decks: [{ id: 'remote-deck', name: 'Remote deck', topicIds: '[]', createdAt: 1 }],
      user_requirements: [{ listingSlug: 'y', requirementIndex: 1, acquiredAt: 1 }],
      study_plan_items: [{ id: 9, planDate: '2026-10-01', kind: 'topic_practice', refId: 't', targetCount: 1, completedAt: null, createdAt: 1 }],
    }
    expect(await reconcileAccountOwner(db, 'u1', 'u@x.ph')).toBe('claimed')
    await pullUserData(db)

    expect(raw.prepare(`SELECT id FROM notes ORDER BY id`).all()).toEqual([{ id: 'anon-note' }, { id: 'remote-note' }])
    expect(raw.prepare(`SELECT name FROM note_labels ORDER BY name`).all()).toEqual([{ name: 'Shared' }, { name: 'Study' }])
    const assigns = raw.prepare(`SELECT a.note_id AS n, l.name AS l FROM note_label_assignments a JOIN note_labels l ON l.id = a.label_id ORDER BY n, l`).all()
    expect(assigns).toEqual([
      { n: 'anon-note', l: 'Shared' }, { n: 'anon-note', l: 'Study' }, { n: 'remote-note', l: 'Shared' },
    ])
    expect(raw.prepare(`SELECT listing_slug AS s FROM focus_listings ORDER BY priority`).all()).toEqual([{ s: 'remote-focus' }, { s: 'anon-focus' }])
    expect(count(raw, 'saved_decks')).toBe(2)
    expect(count(raw, 'user_requirements')).toBe(2)
    expect(count(raw, 'study_plan_items')).toBe(2)
    // and the merged result is backed up
    expect(mockState.log).toContain('upsert')
    expect((mockState.remote!.notes as unknown[]).length).toBe(2)
  })
})

describe('4b. a failed upload after the first-sign-in merge cannot lose the merged data (re-review B1)', () => {
  it('leaves the device marked unsynced, so the next pull pushes first and never replaces the merged notes', async () => {
    const { raw, db } = makeDb()
    raw.exec(`INSERT INTO user_settings (id, full_name) VALUES (1, 'Anon')`)
    raw.exec(`INSERT INTO notes (id, title, content, created_at, updated_at) VALUES ('anon-note', 'Anon note', 'x', 1, 1)`)
    const backup = { notes: [note('remote-note', 'Remote note')] }
    mockState.remote = backup
    mockState.upsertError = { message: 'network' }        // the post-merge upload fails
    expect(await reconcileAccountOwner(db, 'u1')).toBe('claimed')
    await pullUserData(db)
    expect(count(raw, 'notes')).toBe(2)                     // merged locally
    expect(Number(setting(raw, 'push_dirty_at'))).toBeGreaterThan(0)

    // Next launch: the backup still holds only the remote note, and uploads still fail.
    mockState.remote = backup
    await pullUserData(db)
    expect(raw.prepare(`SELECT id FROM notes ORDER BY id`).all()).toEqual([{ id: 'anon-note' }, { id: 'remote-note' }])

    // Once an upload succeeds the union is backed up and the marker clears.
    mockState.upsertError = null
    expect(await pushUserData(db)).toBe(true)
    expect(Number(setting(raw, 'push_dirty_at'))).toBe(0)
    expect((mockState.remote!.notes as unknown[]).length).toBe(2)
  })

  it('any upload attempt that fails leaves the data marked unsynced, even if no edit had marked it', async () => {
    const { raw, db } = makeDb()
    own(raw)
    raw.exec(`INSERT INTO notes (id, title, content, created_at, updated_at) VALUES ('n1', 'N', 'x', 1, 1)`)
    mockState.upsertError = { message: 'boom' }
    expect(await pushUserData(db)).toBe(false)
    expect(Number(setting(raw, 'push_dirty_at'))).toBeGreaterThan(0)
  })
})

describe('4c. a failing backup is never silent', () => {
  it('shows the sync error banner message while uploads fail, and clears it once one succeeds', async () => {
    resetSyncStatus()
    const { raw, db } = makeDb()
    own(raw)
    raw.exec(`INSERT INTO notes (id, title, content, created_at, updated_at) VALUES ('n1', 'N', 'x', 1, 1)`)
    mockState.upsertError = { message: 'boom' }
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    await pushUserData(db)
    expect(getSyncStatus().lastError).toMatch(/haven.t been backed up/i)
    mockState.upsertError = null
    await pushUserData(db)
    expect(getSyncStatus().lastError).toBeNull()
    warn.mockRestore()
  })
})

describe('5. push never overwrites a populated backup from an empty never-pulled device', () => {
  it('refuses when the owner has never pulled and every local user table is empty', async () => {
    const { raw, db } = makeDb()
    raw.exec(`INSERT INTO user_settings (id, owner_user_id) VALUES (1, 'u1')`)
    expect(await pushUserData(db)).toBe(false)
    expect(mockState.log).not.toContain('upsert')
  })

  it('pushes once a pull has completed, or when there is local data', async () => {
    const a = makeDb()
    a.raw.exec(`INSERT INTO user_settings (id, owner_user_id, last_pull_ok_at) VALUES (1, 'u1', 5)`)
    expect(await pushUserData(a.db)).toBe(true)
    const b = makeDb()
    b.raw.exec(`INSERT INTO user_settings (id, owner_user_id) VALUES (1, 'u1')`)
    b.raw.exec(`INSERT INTO notes (id, title, content, created_at, updated_at) VALUES ('n', 'x', 'x', 1, 1)`)
    expect(await pushUserData(b.db)).toBe(true)
  })

  it('a completed pull (including "no backup yet") records last_pull_ok_at', async () => {
    const { raw, db } = makeDb()
    mockState.remote = null
    await pullUserData(db)
    expect(Number(setting(raw, 'last_pull_ok_at'))).toBeGreaterThan(0)
  })
})

describe('6. concurrent pulls', () => {
  it('are serialized and do not duplicate log rows', async () => {
    const { raw, db } = makeDb()
    mockState.selectDelayMs = 5
    mockState.remote = { practice_sessions: [session()], user_progress: [{ id: 1, flashcardId: 'f', correct: true, answeredAt: 5 }] }
    await Promise.all([pullUserData(db), pullUserData(db)])
    expect(mockState.maxActive).toBe(1)
    expect(count(raw, 'practice_sessions')).toBe(1)
    expect(count(raw, 'user_progress')).toBe(1)
  })
})

describe('7. account switch cancels the previous account note reminders', () => {
  it('cancels a scheduled reminder for every note that had one', async () => {
    const { raw, db } = makeDb()
    raw.exec(`INSERT INTO user_settings (id, owner_user_id) VALUES (1, 'A')`)
    raw.exec(`INSERT INTO notes (id, title, content, created_at, updated_at, reminder_at) VALUES ('r1', 't', 'c', 1, 1, 99), ('r2', 't', 'c', 1, 1, 98), ('plain', 't', 'c', 1, 1, NULL)`)
    expect(await reconcileAccountOwner(db, 'B', 'b@x.ph')).toBe('switched')
    expect(mockCancelReminder.mock.calls.map(c => c[0]).sort()).toEqual(['r1', 'r2'])
  })
})
