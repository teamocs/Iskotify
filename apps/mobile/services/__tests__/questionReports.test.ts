import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import type { DrizzleClient } from '../../db/client'
import { submitQuestionReport, pushPendingReports } from '../questionReports'

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn() },
    from: jest.fn(),
  },
}))

function makeTestDb(): { db: DrizzleClient; raw: InstanceType<typeof Database> } {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE question_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      source_table TEXT NOT NULL DEFAULT 'flashcards',
      question_text TEXT NOT NULL DEFAULT '',
      synced INTEGER NOT NULL DEFAULT 0
    );
  `)
  return { db: drizzle(raw, { schema }) as unknown as DrizzleClient, raw }
}

let supabase: any

beforeEach(() => {
  jest.clearAllMocks()
  supabase = require('../supabase').supabase
  supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
})

/** Mock the question_reports insert builder. */
function mockReportsInsert(result: { error: unknown } | Promise<never> = { error: null }) {
  const insert = jest.fn().mockImplementation(() =>
    result instanceof Promise ? result : Promise.resolve(result),
  )
  supabase.from.mockReturnValue({ insert })
  return insert
}

describe('submitQuestionReport', () => {
  it('writes a local question_feedback row with reason, source table, and snapshot', async () => {
    const { db, raw } = makeTestDb()
    mockReportsInsert()

    await submitQuestionReport(db, {
      questionId: 'q-77',
      sourceTable: 'upcat_questions',
      questionText: 'What is the powerhouse of the cell?',
      reason: 'Wrong answer',
    })

    const row = raw.prepare('SELECT * FROM question_feedback').get() as any
    expect(row).toBeTruthy()
    expect(row.card_id).toBe('q-77')
    expect(row.source_table).toBe('upcat_questions')
    expect(row.question_text).toBe('What is the powerhouse of the cell?')
    expect(row.reason).toBe('Wrong answer')
  })

  it('uploads to supabase question_reports with the correct payload (anonymous user)', async () => {
    const { db } = makeTestDb()
    const insert = mockReportsInsert()

    await submitQuestionReport(db, {
      questionId: 'card-1',
      sourceTable: 'flashcards',
      questionText: 'Q stem',
      reason: 'Typo or formatting issue',
    })

    expect(supabase.from).toHaveBeenCalledWith('question_reports')
    expect(insert).toHaveBeenCalledWith({
      question_id: 'card-1',
      source_table: 'flashcards',
      question_text: 'Q stem',
      reason: 'Typo or formatting issue',
      user_id: null,
    })
  })

  it('sends the signed-in user id and marks the local row synced=1 on success', async () => {
    const { db, raw } = makeTestDb()
    const insert = mockReportsInsert()
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'user-9' } } } })

    await submitQuestionReport(db, {
      questionId: 'card-2',
      sourceTable: 'flashcards',
      questionText: 'Q',
      reason: 'Other',
    })

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user-9' }))
    const row = raw.prepare('SELECT * FROM question_feedback').get() as any
    expect(row.synced).toBe(1)
  })

  it('truncates the question_text snapshot to 500 chars', async () => {
    const { db, raw } = makeTestDb()
    const insert = mockReportsInsert()
    const long = 'x'.repeat(800)

    await submitQuestionReport(db, {
      questionId: 'card-3',
      sourceTable: 'flashcards',
      questionText: long,
      reason: 'Question is unclear',
    })

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ question_text: 'x'.repeat(500) }),
    )
    const row = raw.prepare('SELECT * FROM question_feedback').get() as any
    expect(row.question_text).toHaveLength(500)
  })

  it('does NOT throw when the upload fails — local row stays queued with synced=0', async () => {
    const { db, raw } = makeTestDb()
    const insert = jest.fn().mockRejectedValue(new Error('offline'))
    supabase.from.mockReturnValue({ insert })

    await expect(
      submitQuestionReport(db, {
        questionId: 'card-4',
        sourceTable: 'flashcards',
        questionText: 'Q',
        reason: 'Wrong answer',
      }),
    ).resolves.toBeUndefined()

    const row = raw.prepare('SELECT * FROM question_feedback').get() as any
    expect(row).toBeTruthy()
    expect(row.synced).toBe(0)
  })

  it('keeps synced=0 when supabase returns an error object', async () => {
    const { db, raw } = makeTestDb()
    mockReportsInsert({ error: { message: 'RLS denied' } })

    await submitQuestionReport(db, {
      questionId: 'card-5',
      sourceTable: 'flashcards',
      questionText: 'Q',
      reason: 'Other',
    })

    const row = raw.prepare('SELECT * FROM question_feedback').get() as any
    expect(row.synced).toBe(0)
  })
})

describe('pushPendingReports', () => {
  function seedRow(raw: InstanceType<typeof Database>, overrides: Partial<{
    cardId: string; reason: string; sourceTable: string; questionText: string; synced: number
  }> = {}) {
    raw.prepare(`
      INSERT INTO question_feedback (card_id, reason, created_at, source_table, question_text, synced)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      overrides.cardId ?? 'card-a',
      overrides.reason ?? 'Wrong answer',
      Date.now(),
      overrides.sourceTable ?? 'flashcards',
      overrides.questionText ?? 'Q text',
      overrides.synced ?? 0,
    )
  }

  it('uploads only unsynced rows and marks them synced=1 on success', async () => {
    const { db, raw } = makeTestDb()
    seedRow(raw, { cardId: 'pending-1', synced: 0 })
    seedRow(raw, { cardId: 'already-synced', synced: 1 })
    const insert = mockReportsInsert()

    await pushPendingReports(db)

    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ question_id: 'pending-1' }))
    const rows = raw.prepare('SELECT card_id, synced FROM question_feedback ORDER BY id').all() as any[]
    expect(rows).toEqual([
      { card_id: 'pending-1', synced: 1 },
      { card_id: 'already-synced', synced: 1 },
    ])
  })

  it('swallows network errors and leaves rows queued', async () => {
    const { db, raw } = makeTestDb()
    seedRow(raw, { cardId: 'pending-2', synced: 0 })
    const insert = jest.fn().mockRejectedValue(new Error('offline'))
    supabase.from.mockReturnValue({ insert })

    await expect(pushPendingReports(db)).resolves.toBeUndefined()

    const row = raw.prepare('SELECT synced FROM question_feedback').get() as any
    expect(row.synced).toBe(0)
  })

  it('does nothing when there are no unsynced rows', async () => {
    const { db, raw } = makeTestDb()
    seedRow(raw, { synced: 1 })
    const insert = mockReportsInsert()

    await pushPendingReports(db)

    expect(insert).not.toHaveBeenCalled()
  })
})
