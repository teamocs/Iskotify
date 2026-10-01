/**
 * Batch C review (1b) — user-curated edits schedule the debounced cloud push
 * promptly (otherwise the pull-time REPLACE would revert them).
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { updateSettings } from '../settings'
import { persistPlanItems, markPlanItemDone, markPlanItemsDoneForSession, markPlanItemsDoneForSrsReview } from '../studyPlan'
import { toggleRequirement } from '../coachQueue'
import { formatPlanDate } from '../../utils/studyPlan'

const mockSchedule = jest.fn()
jest.mock('../pushScheduler', () => ({ schedulePushUserData: (...a: unknown[]) => mockSchedule(...a) }))

function makeDb() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup */ } }
  return { raw, db: drizzle(raw, { schema }) as unknown as DrizzleClient }
}

beforeEach(() => mockSchedule.mockClear())

describe('settings', () => {
  it('updateSettings schedules a push', async () => {
    const { db } = makeDb()
    await updateSettings(db, { fullName: 'Juan' })
    expect(mockSchedule.mock.calls.some(c => c[0] === db)).toBe(true)
  })
})

describe('study plan', () => {
  const NOW = 1_700_000_000_000

  it('persistPlanItems schedules a push', async () => {
    const { db } = makeDb()
    await persistPlanItems(db, formatPlanDate(new Date(NOW)), [{ kind: 'srs_review', refId: '', targetCount: 1 } as never], NOW)
    expect(mockSchedule).toHaveBeenCalledTimes(1)
  })

  it('markPlanItemDone schedules a push', async () => {
    const { db } = makeDb()
    await markPlanItemDone(db, 1, NOW)
    expect(mockSchedule).toHaveBeenCalledTimes(1)
  })

  it('session / SRS completion schedules a push only when an item was actually completed', async () => {
    const { raw, db } = makeDb()
    await markPlanItemsDoneForSrsReview(db, 5, NOW)
    await markPlanItemsDoneForSession(db, { listingSlug: 'x', topicId: '', deckId: '', subtest: null, kind: 'drill' } as never, NOW)
    expect(mockSchedule).not.toHaveBeenCalled()
    raw.prepare(`INSERT INTO study_plan_items (plan_date, kind, ref_id, target_count, created_at) VALUES (?, 'srs_review', '', 1, 1)`)
      .run(formatPlanDate(new Date(NOW)))
    await markPlanItemsDoneForSrsReview(db, 5, NOW)
    expect(mockSchedule).toHaveBeenCalledTimes(1)
  })
})

describe('requirements', () => {
  it('toggleRequirement schedules a push for acquire and for release', async () => {
    const { db } = makeDb()
    await toggleRequirement(db, 'x', 0, true)
    await toggleRequirement(db, 'x', 0, false)
    expect(mockSchedule).toHaveBeenCalledTimes(2)
  })
})
