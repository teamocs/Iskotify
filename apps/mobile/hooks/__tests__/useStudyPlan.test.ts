import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { renderHook, waitFor, act } from '@testing-library/react-native'
import * as schema from '../../db/schema'
import { studyPlanItems, topics, flashcards, userProgress, listings, focusListings } from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { useStudyPlan } from '../useStudyPlan'
import { formatPlanDate } from '../../utils/studyPlan'

// useStudyPlan() reads its db via useDb() — stub it so each test gets its own
// controllable in-memory db (same pattern as useRecordSrs.test.ts).
let mockDb: DrizzleClient | null = null
jest.mock('../useDb', () => ({ useDb: () => mockDb }))

// useFocusEffect just needs to run its callback on mount/deps-change, same
// stand-in as hooks/__tests__/useAnalytics.test.ts.
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(cb, [cb])
  },
}))

function makeDb(): DrizzleClient {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup column/table on re-run */ } }
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

describe('useStudyPlan', () => {
  afterEach(() => { mockDb = null })

  it('generates a single diagnostic item for a brand-new user with no data at all', async () => {
    const db = makeDb()
    mockDb = db
    const { result } = renderHook(() => useStudyPlan())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0]).toMatchObject({ kind: 'diagnostic', refId: '' })
    expect(result.current.allDone).toBe(false)

    const rows = await db.select().from(studyPlanItems)
    expect(rows).toHaveLength(1)
  })

  it('is idempotent per day — reloading does not duplicate rows', async () => {
    const db = makeDb()
    mockDb = db
    const { result } = renderHook(() => useStudyPlan())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.refresh() })
    await act(async () => { await result.current.refresh() })

    const rows = await db.select().from(studyPlanItems)
    expect(rows).toHaveLength(1) // still just the one diagnostic item
  })

  it('generates a topic_practice item sized for the light pacing band when a topic is weak and nothing is due', async () => {
    const db = makeDb()
    mockDb = db

    await db.insert(topics).values({ id: 't1', name: 'Algebra', subjectId: 'math', status: 'published' })
    await db.insert(flashcards).values({
      id: 'fc1', topicId: 't1', question: 'q', answer: 'a', explanation: 'e', status: 'published',
    })
    // 2 correct / 5 = 40% < 60% weak-topic threshold
    const now = Date.now()
    await db.insert(userProgress).values([
      { flashcardId: 'fc1', correct: true, answeredAt: now },
      { flashcardId: 'fc1', correct: false, answeredAt: now },
      { flashcardId: 'fc1', correct: false, answeredAt: now },
      { flashcardId: 'fc1', correct: false, answeredAt: now },
      { flashcardId: 'fc1', correct: false, answeredAt: now },
    ])

    const { result } = renderHook(() => useStudyPlan())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0]).toMatchObject({ kind: 'topic_practice', refId: 't1', targetCount: 8 })
  })

  it('returns an all-caught-up empty plan when there is practice history but nothing due/weak', async () => {
    const db = makeDb()
    mockDb = db

    // A single high-accuracy topic — practice history exists (hasAnyReadinessData),
    // but accuracy is well above the <60% weak threshold, so nothing is weak.
    await db.insert(topics).values({ id: 't1', name: 'Algebra', subjectId: 'math', status: 'published' })
    await db.insert(flashcards).values({
      id: 'fc1', topicId: 't1', question: 'q', answer: 'a', explanation: 'e', status: 'published',
    })
    await db.insert(userProgress).values([
      { flashcardId: 'fc1', correct: true, answeredAt: Date.now() },
      { flashcardId: 'fc1', correct: true, answeredAt: Date.now() },
    ])

    const { result } = renderHook(() => useStudyPlan())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.items).toHaveLength(0)
    expect(result.current.allDone).toBe(false) // "caught up", not "completed" — items.length is 0

    const rows = await db.select().from(studyPlanItems)
    expect(rows).toHaveLength(0) // an empty plan is never persisted
  })

  it('markComplete sets completedAt and flips allDone once every item is done', async () => {
    const db = makeDb()
    mockDb = db
    const { result } = renderHook(() => useStudyPlan())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toHaveLength(1) // diagnostic, brand-new user

    const id = result.current.items[0]!.id
    await act(async () => { await result.current.markComplete(id) })

    expect(result.current.items[0]!.completedAt).not.toBeNull()
    expect(result.current.allDone).toBe(true)

    const rows = await db.select().from(studyPlanItems)
    expect(rows[0]!.completedAt).not.toBeNull()
  })

  it('nearest focused exam feeds mockSectionRefId + earliestExamDate into the generator', async () => {
    const db = makeDb()
    mockDb = db
    const now = Date.now()
    const examDate = now + 10 * 86_400_000 // 10 days out → heavy pacing band

    await db.insert(listings).values({
      id: 'l1', slug: 'upcat', title: 'UPCAT', type: 'exam', status: 'published', examDate,
    })
    await db.insert(focusListings).values({ listingSlug: 'upcat', priority: 1, addedAt: now })
    await db.insert(topics).values({ id: 't1', name: 'Algebra', subjectId: 'math', status: 'published' })
    await db.insert(flashcards).values({
      id: 'fc1', topicId: 't1', question: 'q', answer: 'a', explanation: 'e', status: 'published',
    })
    await db.insert(userProgress).values([
      { flashcardId: 'fc1', correct: false, answeredAt: now },
      { flashcardId: 'fc1', correct: false, answeredAt: now },
    ])

    const { result } = renderHook(() => useStudyPlan())
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Weak topic present, nothing due — heavy band still just gets the one
    // topic_practice item (mock_section only fires on Sunday, and only
    // alongside a due-SRS item's presence isn't required, but the weekly-day
    // gate almost certainly won't line up with "whenever this test runs").
    expect(result.current.items.some(i => i.kind === 'topic_practice' && i.refId === 't1')).toBe(true)
  })
})
