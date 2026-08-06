import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { studyPlanItems, topics, flashcards, userProgress, flashcardSrs, listings, focusListings } from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import {
  gatherPlanInputs, persistPlanItems, getPlanItemsForDate, markPlanItemDone,
  markPlanItemsDoneForSession, markPlanItemsDoneForSrsReview,
} from '../studyPlan'
import { formatPlanDate } from '../../utils/studyPlan'

function makeDb(): { raw: InstanceType<typeof Database>; db: DrizzleClient } {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup column/table on re-run */ } }
  const db = drizzle(raw, { schema }) as unknown as DrizzleClient
  return { raw, db }
}

const DAY_MS = 86_400_000
const NOW = 1_700_000_000_000
const TODAY = new Date(NOW)
const PLAN_DATE = formatPlanDate(TODAY)

let db: DrizzleClient

beforeEach(() => {
  db = makeDb().db
})

describe('gatherPlanInputs', () => {
  it('reports no signal at all for a brand-new user', async () => {
    const input = await gatherPlanInputs(db, TODAY)
    expect(input).toMatchObject({
      dueSrsCount: 0,
      weakTopics: [],
      hasAnyReadinessData: false,
      earliestExamDate: null,
      mockSectionRefId: null,
    })
    expect(input.today).toBe(TODAY)
  })

  it('picks the nearest FUTURE focused exam, ignoring past dates and school-focus slugs', async () => {
    await db.insert(listings).values([
      { id: 'l1', slug: 'far-exam', title: 'Far', type: 'exam', status: 'published', examDate: NOW + 90 * DAY_MS },
      { id: 'l2', slug: 'near-exam', title: 'Near', type: 'exam', status: 'published', examDate: NOW + 5 * DAY_MS },
      { id: 'l3', slug: 'past-exam', title: 'Past', type: 'exam', status: 'published', examDate: NOW - 5 * DAY_MS },
    ])
    await db.insert(focusListings).values([
      { listingSlug: 'far-exam', priority: 1, addedAt: NOW },
      { listingSlug: 'near-exam', priority: 2, addedAt: NOW },
      { listingSlug: 'past-exam', priority: 3, addedAt: NOW },
      { listingSlug: 'school:abc', priority: 4, addedAt: NOW },
    ])

    const input = await gatherPlanInputs(db, TODAY)
    expect(input.earliestExamDate).toBe(NOW + 5 * DAY_MS)
    expect(input.mockSectionRefId).toBe('near-exam')
  })

  it('surfaces due SRS count and weak topics (<60%), sorted weakest-first', async () => {
    await db.insert(topics).values([
      { id: 't1', name: 'Algebra', subjectId: 's', status: 'published' },
      { id: 't2', name: 'Biology', subjectId: 's', status: 'published' },
    ])
    await db.insert(flashcards).values([
      { id: 'fc1', topicId: 't1', question: 'q', answer: 'a', explanation: 'e', status: 'published' },
      { id: 'fc2', topicId: 't2', question: 'q', answer: 'a', explanation: 'e', status: 'published' },
      { id: 'fc3', topicId: 't2', question: 'q', answer: 'a', explanation: 'e', status: 'published' },
    ])
    // t1: 1/5 = 20% (weakest). t2: 4/5 = 80% (not weak, excluded).
    await db.insert(userProgress).values([
      { flashcardId: 'fc1', correct: true, answeredAt: NOW }, { flashcardId: 'fc1', correct: false, answeredAt: NOW },
      { flashcardId: 'fc1', correct: false, answeredAt: NOW }, { flashcardId: 'fc1', correct: false, answeredAt: NOW },
      { flashcardId: 'fc1', correct: false, answeredAt: NOW },
      { flashcardId: 'fc2', correct: true, answeredAt: NOW }, { flashcardId: 'fc2', correct: true, answeredAt: NOW },
      { flashcardId: 'fc2', correct: true, answeredAt: NOW }, { flashcardId: 'fc2', correct: true, answeredAt: NOW },
      { flashcardId: 'fc2', correct: false, answeredAt: NOW },
    ])
    // fc3 is due for SRS review.
    await db.insert(flashcardSrs).values({ flashcardId: 'fc3', dueAt: NOW - 1000, intervalDays: 1, easeFactor: 2.5, repetitions: 1, lapses: 0 })

    const input = await gatherPlanInputs(db, TODAY)
    expect(input.dueSrsCount).toBe(1)
    expect(input.weakTopics).toEqual([{ topicId: 't1', topicName: 'Algebra', accuracy: 20 }])
    expect(input.hasAnyReadinessData).toBe(true)
  })
})

describe('persistPlanItems + getPlanItemsForDate', () => {
  it('inserts drafts and reads them back for the same plan date', async () => {
    const inserted = await persistPlanItems(db, PLAN_DATE, [
      { kind: 'srs_review', refId: '', targetCount: 10 },
      { kind: 'topic_practice', refId: 't1', targetCount: 8 },
    ], NOW)
    expect(inserted).toHaveLength(2)
    expect(inserted[0]).toMatchObject({ kind: 'srs_review', targetCount: 10, completedAt: null })

    const loaded = await getPlanItemsForDate(db, PLAN_DATE)
    expect(loaded).toHaveLength(2)

    const otherDay = await getPlanItemsForDate(db, formatPlanDate(new Date(NOW + DAY_MS)))
    expect(otherDay).toHaveLength(0)
  })

  it('does nothing for an empty draft list', async () => {
    const inserted = await persistPlanItems(db, PLAN_DATE, [], NOW)
    expect(inserted).toEqual([])
    expect(await getPlanItemsForDate(db, PLAN_DATE)).toHaveLength(0)
  })
})

describe('markPlanItemDone', () => {
  it('sets completedAt once, and is a no-op on an already-completed item', async () => {
    const [item] = await persistPlanItems(db, PLAN_DATE, [{ kind: 'diagnostic', refId: '', targetCount: 1 }], NOW)
    await markPlanItemDone(db, item!.id, NOW + 1000)

    let rows = await getPlanItemsForDate(db, PLAN_DATE)
    expect(rows[0]!.completedAt).toBe(NOW + 1000)

    // Second call with a different `now` must not move an already-set completedAt.
    await markPlanItemDone(db, item!.id, NOW + 5000)
    rows = await getPlanItemsForDate(db, PLAN_DATE)
    expect(rows[0]!.completedAt).toBe(NOW + 1000)
  })
})

describe('markPlanItemsDoneForSession', () => {
  it('marks a matching topic_practice item done and leaves others untouched', async () => {
    const items = await persistPlanItems(db, PLAN_DATE, [
      { kind: 'srs_review', refId: '', targetCount: 10 },
      { kind: 'topic_practice', refId: 't1', targetCount: 8 },
    ], NOW)

    await markPlanItemsDoneForSession(db, { topicId: 't1', listingSlug: '', subtest: null }, NOW + 1000)

    const rows = await getPlanItemsForDate(db, PLAN_DATE)
    const topicItem = rows.find(r => r.id === items[1]!.id)
    const srsItem = rows.find(r => r.id === items[0]!.id)
    expect(topicItem!.completedAt).toBe(NOW + 1000)
    expect(srsItem!.completedAt).toBeNull() // srs_review is never matched by a session signal
  })

  it('marks a matching mock_section item done only when the listing AND a subtest both match', async () => {
    const [item] = await persistPlanItems(db, PLAN_DATE, [{ kind: 'mock_section', refId: 'upcat', targetCount: 1 }], NOW)

    await markPlanItemsDoneForSession(db, { topicId: '', listingSlug: 'upcat', subtest: null }, NOW + 1000)
    expect((await getPlanItemsForDate(db, PLAN_DATE))[0]!.completedAt).toBeNull() // no subtest yet

    await markPlanItemsDoneForSession(db, { topicId: '', listingSlug: 'upcat', subtest: 'Mathematics' }, NOW + 2000)
    expect((await getPlanItemsForDate(db, PLAN_DATE))[0]!.completedAt).toBe(NOW + 2000)
  })

  it('a diagnostic item is satisfied by ANY completed session', async () => {
    await persistPlanItems(db, PLAN_DATE, [{ kind: 'diagnostic', refId: '', targetCount: 1 }], NOW)
    await markPlanItemsDoneForSession(db, { topicId: 'whatever', listingSlug: 'whatever', subtest: null }, NOW + 1000)
    expect((await getPlanItemsForDate(db, PLAN_DATE))[0]!.completedAt).toBe(NOW + 1000)
  })
})

describe('markPlanItemsDoneForSrsReview', () => {
  it('marks an srs_review item done when at least one review was recorded, ignores other kinds', async () => {
    const items = await persistPlanItems(db, PLAN_DATE, [
      { kind: 'srs_review', refId: '', targetCount: 10 },
      { kind: 'topic_practice', refId: 't1', targetCount: 8 },
    ], NOW)

    await markPlanItemsDoneForSrsReview(db, 3, NOW + 1000)

    const rows = await getPlanItemsForDate(db, PLAN_DATE)
    expect(rows.find(r => r.id === items[0]!.id)!.completedAt).toBe(NOW + 1000)
    expect(rows.find(r => r.id === items[1]!.id)!.completedAt).toBeNull()
  })

  it('does nothing when reviewCount is 0', async () => {
    const [item] = await persistPlanItems(db, PLAN_DATE, [{ kind: 'srs_review', refId: '', targetCount: 10 }], NOW)
    await markPlanItemsDoneForSrsReview(db, 0, NOW + 1000)
    expect((await getPlanItemsForDate(db, PLAN_DATE))[0]!.completedAt).toBeNull()
    void item
  })
})
