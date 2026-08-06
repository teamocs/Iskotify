import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { renderHook } from '@testing-library/react-native'
import * as schema from '../../db/schema'
import { flashcardSrs } from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { useRecordSrs } from '../useRecordSrs'
import { DEFAULT_EASE_FACTOR, FAST_THRESHOLD_MS } from '../../utils/srs'

// useRecordSrs() reads its db via useDb() — stub it so each test gets its own
// controllable in-memory db (same pattern as useRecordAttempts.test.ts).
let mockDb: DrizzleClient | null = null
jest.mock('../useDb', () => ({ useDb: () => mockDb }))

function makeDb(): DrizzleClient {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup column/table on re-run */ } }
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

const DAY_MS = 86_400_000

describe('useRecordSrs', () => {
  afterEach(() => { mockDb = null })

  it('does nothing (no insert) when given an empty review list', async () => {
    const db = makeDb()
    mockDb = db
    const { result } = renderHook(() => useRecordSrs())

    await result.current.recordSrs([])

    const rows = await db.select().from(flashcardSrs)
    expect(rows).toHaveLength(0)
  })

  it('inserts a fresh flashcard_srs row for a never-reviewed card (correct + fast → Easy, 1-day interval)', async () => {
    const db = makeDb()
    mockDb = db
    const { result } = renderHook(() => useRecordSrs())

    await result.current.recordSrs([{ flashcardId: 'fc1', correct: true, elapsedMs: 1000 }])

    const rows = await db.select().from(flashcardSrs)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ flashcardId: 'fc1', repetitions: 1, intervalDays: 1, lastGrade: 'easy' })
    expect(rows[0]!.easeFactor).toBeGreaterThan(DEFAULT_EASE_FACTOR)
    expect(rows[0]!.dueAt).toBeGreaterThan(Date.now())
  })

  it('a wrong answer produces an Again row (lapse) even for a brand-new card', async () => {
    const db = makeDb()
    mockDb = db
    const { result } = renderHook(() => useRecordSrs())

    await result.current.recordSrs([{ flashcardId: 'fc1', correct: false, elapsedMs: 5000 }])

    const rows = await db.select().from(flashcardSrs)
    expect(rows[0]).toMatchObject({ repetitions: 0, intervalDays: 1, lapses: 1, lastGrade: 'again' })
  })

  it('upserts (read-modify-write) an existing row rather than inserting a duplicate', async () => {
    const db = makeDb()
    mockDb = db
    const now = Date.now()
    // Seed a card already at repetitions=1 (as if reviewed once before).
    await db.insert(flashcardSrs).values({
      flashcardId: 'fc1',
      intervalDays: 1,
      easeFactor: DEFAULT_EASE_FACTOR,
      repetitions: 1,
      lapses: 0,
      dueAt: now - DAY_MS, // already due
      lastReviewedAt: now - DAY_MS,
      lastGrade: 'good',
    })

    const { result } = renderHook(() => useRecordSrs())
    await result.current.recordSrs([{ flashcardId: 'fc1', correct: true, elapsedMs: FAST_THRESHOLD_MS + 1 }])

    const rows = await db.select().from(flashcardSrs)
    expect(rows).toHaveLength(1) // still one row, not two
    expect(rows[0]).toMatchObject({ repetitions: 2, intervalDays: 3, lastGrade: 'good' })
  })

  it('processes multiple reviews from one run, each against its own prior state', async () => {
    const db = makeDb()
    mockDb = db
    const { result } = renderHook(() => useRecordSrs())

    await result.current.recordSrs([
      { flashcardId: 'fc1', correct: true, elapsedMs: 500 },
      { flashcardId: 'fc2', correct: false, elapsedMs: 500 },
    ])

    const rows = await db.select().from(flashcardSrs)
    expect(rows).toHaveLength(2)
    const byId = Object.fromEntries(rows.map(r => [r.flashcardId, r]))
    expect(byId.fc1).toMatchObject({ lastGrade: 'easy', repetitions: 1 })
    expect(byId.fc2).toMatchObject({ lastGrade: 'again', repetitions: 0, lapses: 1 })
  })
})
