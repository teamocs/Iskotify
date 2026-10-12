import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { renderHook, waitFor } from '@testing-library/react-native'
import * as schema from '../../db/schema'
import { flashcardSrs } from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { useRecordSrs, readSrsStates, useSrsStates } from '../useRecordSrs'
import { DEFAULT_EASE_FACTOR, FAST_THRESHOLD_MS } from '../../utils/srs'

const mockMarkSrs = jest.fn().mockResolvedValue(undefined)
jest.mock('../../services/studyPlan', () => ({
  markPlanItemsDoneForSrsReview: (...args: unknown[]) => mockMarkSrs(...args),
}))

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

  // A6: the SM-2 ladder assumes one review per due date. Re-answering a card
  // that isn't due (e.g. a topic quiz hours after its last review) used to
  // march it up the ladder / lapse it on every pass.
  it('leaves the schedule untouched for a card that is not yet due', async () => {
    const db = makeDb()
    mockDb = db
    const now = Date.now()
    const seeded = {
      flashcardId: 'fc1', intervalDays: 3, easeFactor: 2.5, repetitions: 2, lapses: 0,
      dueAt: now + 2 * DAY_MS, lastReviewedAt: now - DAY_MS, lastGrade: 'good' as const,
    }
    await db.insert(flashcardSrs).values(seeded)
    const { result } = renderHook(() => useRecordSrs())

    await result.current.recordSrs([{ flashcardId: 'fc1', correct: false, elapsedMs: 500 }])

    const rows = await db.select().from(flashcardSrs)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject(seeded)
  })

  it('advances a card whose dueAt has arrived (dueAt <= now)', async () => {
    const db = makeDb()
    mockDb = db
    const now = Date.now()
    await db.insert(flashcardSrs).values({
      flashcardId: 'fc1', intervalDays: 1, easeFactor: 2.5, repetitions: 1, lapses: 0,
      dueAt: now - 1000, lastReviewedAt: now - DAY_MS, lastGrade: 'good',
    })
    const { result } = renderHook(() => useRecordSrs())
    await result.current.recordSrs([{ flashcardId: 'fc1', correct: true, elapsedMs: 500 }])
    const rows = await db.select().from(flashcardSrs)
    expect(rows[0]!.repetitions).toBe(2)
  })

  it('passes only the due/new reviews to the plan bookkeeping', async () => {
    const db = makeDb()
    mockDb = db
    mockMarkSrs.mockClear()
    const now = Date.now()
    await db.insert(flashcardSrs).values({
      flashcardId: 'notdue', intervalDays: 3, easeFactor: 2.5, repetitions: 2, lapses: 0,
      dueAt: now + DAY_MS, lastReviewedAt: now, lastGrade: 'good',
    })
    const { result } = renderHook(() => useRecordSrs())
    await result.current.recordSrs([
      { flashcardId: 'notdue', correct: true, elapsedMs: 500 },
      { flashcardId: 'brand-new', correct: true, elapsedMs: 500 },
    ])
    await new Promise(r => setTimeout(r, 0))
    expect(mockMarkSrs).toHaveBeenCalledTimes(1)
    expect(mockMarkSrs.mock.calls[0]![1]).toBe(1)
  })

  // iOS redesign P4: the self-graded card stack passes the grade it was given.
  it('uses an explicit grade instead of deriving one (hard on a second rep → 2 days)', async () => {
    const db = makeDb()
    mockDb = db
    const now = Date.now()
    await db.insert(flashcardSrs).values({
      flashcardId: 'fc1', intervalDays: 1, easeFactor: 2.5, repetitions: 1, lapses: 0,
      dueAt: now - 1000, lastReviewedAt: now - DAY_MS, lastGrade: 'good',
    })
    const { result } = renderHook(() => useRecordSrs())
    // correct + fast would derive Easy; the explicit grade wins.
    await result.current.recordSrs([{ flashcardId: 'fc1', correct: true, elapsedMs: 500, grade: 'hard' }])
    const rows = await db.select().from(flashcardSrs)
    expect(rows[0]).toMatchObject({ repetitions: 2, intervalDays: 2, lastGrade: 'hard' })
    expect(rows[0]!.easeFactor).toBeCloseTo(2.35)
  })

  it('an explicit Again lapses a new card', async () => {
    const db = makeDb()
    mockDb = db
    const { result } = renderHook(() => useRecordSrs())
    await result.current.recordSrs([{ flashcardId: 'fc1', correct: false, elapsedMs: 0, grade: 'again' }])
    const rows = await db.select().from(flashcardSrs)
    expect(rows[0]).toMatchObject({ repetitions: 0, lapses: 1, lastGrade: 'again' })
  })

  it('keeps the not-due-yet skip rule for an explicit grade', async () => {
    const db = makeDb()
    mockDb = db
    const now = Date.now()
    const seeded = {
      flashcardId: 'fc1', intervalDays: 3, easeFactor: 2.5, repetitions: 2, lapses: 0,
      dueAt: now + DAY_MS, lastReviewedAt: now - DAY_MS, lastGrade: 'good' as const,
    }
    await db.insert(flashcardSrs).values(seeded)
    const { result } = renderHook(() => useRecordSrs())
    await result.current.recordSrs([{ flashcardId: 'fc1', correct: true, elapsedMs: 0, grade: 'easy' }])
    const rows = await db.select().from(flashcardSrs)
    expect(rows[0]).toMatchObject(seeded)
  })

  it('skips plan bookkeeping entirely when nothing was due or new', async () => {
    const db = makeDb()
    mockDb = db
    mockMarkSrs.mockClear()
    const now = Date.now()
    await db.insert(flashcardSrs).values({
      flashcardId: 'notdue', intervalDays: 3, easeFactor: 2.5, repetitions: 2, lapses: 0,
      dueAt: now + DAY_MS, lastReviewedAt: now, lastGrade: 'good',
    })
    const { result } = renderHook(() => useRecordSrs())
    await result.current.recordSrs([{ flashcardId: 'notdue', correct: true, elapsedMs: 500 }])
    await new Promise(r => setTimeout(r, 0))
    expect(mockMarkSrs).not.toHaveBeenCalled()
  })
})

describe('readSrsStates / useSrsStates', () => {
  afterEach(() => { mockDb = null })

  it('reads the stored state for the given ids only; unreviewed ids are absent', async () => {
    const db = makeDb()
    const now = Date.now()
    await db.insert(flashcardSrs).values([
      { flashcardId: 'a', intervalDays: 3, easeFactor: 2.4, repetitions: 2, lapses: 1, dueAt: now, lastReviewedAt: now - DAY_MS, lastGrade: 'good' },
      { flashcardId: 'z', intervalDays: 9, easeFactor: 2.5, repetitions: 3, lapses: 0, dueAt: now, lastReviewedAt: now, lastGrade: 'easy' },
    ])
    const states = await readSrsStates(db, ['a', 'b'])
    expect(states.get('a')).toEqual({
      intervalDays: 3, easeFactor: 2.4, repetitions: 2, lapses: 1, dueAt: now, lastReviewedAt: now - DAY_MS, lastGrade: 'good',
    })
    expect(states.has('b')).toBe(false)
    expect(states.has('z')).toBe(false)
  })

  it('returns an empty map without querying for no ids', async () => {
    const db = { select: jest.fn() } as unknown as DrizzleClient
    const states = await readSrsStates(db, [])
    expect(states.size).toBe(0)
    expect((db as any).select).not.toHaveBeenCalled()
  })

  it('the hook reports loaded once the states arrive', async () => {
    const db = makeDb()
    mockDb = db
    const now = Date.now()
    await db.insert(flashcardSrs).values({
      flashcardId: 'a', intervalDays: 1, easeFactor: 2.5, repetitions: 1, lapses: 0, dueAt: now, lastReviewedAt: now, lastGrade: 'good',
    })
    const { result } = renderHook(() => useSrsStates(['a']))
    expect(result.current.loaded).toBe(false)
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.states.get('a')?.repetitions).toBe(1)
  })
})
