/**
 * P3 Full Access: the offline premium cache on user_settings, and the counts
 * the free limits are checked against. Real SQLite (CREATE_SQL + MIGRATIONS).
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { readPremiumCache, writePremiumCache, clearPremiumCache } from '../premiumCache'
import { countPracticeAnswersToday, countFullMocks } from '../premiumUsage'

function makeDb() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup */ } }
  return { raw, db: drizzle(raw, { schema }) as unknown as DrizzleClient }
}

// 2026-10-02 10:00 in Manila.
const NOW = Date.UTC(2026, 9, 2, 2, 0)
const MANILA_MIDNIGHT = Date.UTC(2026, 9, 1, 16, 0)

function session(db: DrizzleClient, kind: string, attemptKey: number, listingSlug = 'upcat') {
  return db.insert(schema.practiceSessions).values({
    listingSlug, topicId: '', deckId: '', score: 1, total: 1, durationSecs: 60,
    completedAt: attemptKey + 60_000, subtest: 'Math', kind, attemptKey,
  })
}

function attempts(db: DrizzleClient, sessionKey: number, answeredAt: number, picks: (number | null)[], sourceTable = 'upcat_questions') {
  return db.insert(schema.questionAttempts).values(picks.map((selectedIndex, i) => ({
    sessionKey, sourceTable, questionId: `q${sessionKey}-${i}`, listingSlug: 'upcat', subtest: 'Math', topic: null,
    selectedIndex, correctIndex: 0, correct: selectedIndex === 0, elapsedMs: 1000, answeredAt,
  })))
}

describe('premium cache (user_settings.premium_cached / premium_checked_at)', () => {
  it('reads false before anything was stored', async () => {
    const { db } = makeDb()
    expect(await readPremiumCache(db)).toEqual({ premium: false, checkedAt: 0, userId: '' })
  })

  it('stores and reads back the last known state', async () => {
    const { db, raw } = makeDb()
    await writePremiumCache(db, true, 'u1', 1234)
    expect(await readPremiumCache(db)).toEqual({ premium: true, checkedAt: 1234, userId: 'u1' })
    const r = raw.prepare('SELECT premium_cached, premium_checked_at, premium_user_id FROM user_settings WHERE id = 1').get()
    expect(r).toEqual({ premium_cached: 1, premium_checked_at: 1234, premium_user_id: 'u1' })
  })

  it('clears to free on sign-out', async () => {
    const { db } = makeDb()
    await writePremiumCache(db, true, 'u1', 1234)
    await clearPremiumCache(db)
    expect(await readPremiumCache(db)).toEqual({ premium: false, checkedAt: 0, userId: '' })
  })

  it('never touches the rest of the settings row', async () => {
    const { db, raw } = makeDb()
    raw.prepare("INSERT INTO user_settings (id, full_name, age_band) VALUES (1, 'Juan', 'adult')").run()
    await writePremiumCache(db, true, 'u1', 99)
    const r = raw.prepare('SELECT full_name, age_band, push_dirty_at FROM user_settings WHERE id = 1').get()
    expect(r).toEqual({ full_name: 'Juan', age_band: 'adult', push_dirty_at: 0 })
  })
})

describe('countPracticeAnswersToday', () => {
  it('counts answered UPCAT drill questions from today, in Manila time', async () => {
    const { db } = makeDb()
    const k1 = MANILA_MIDNIGHT + 60_000
    await session(db, 'drill', k1)
    await attempts(db, k1, MANILA_MIDNIGHT + 120_000, [0, 1, 2, null]) // 3 answered, 1 skipped
    const k2 = NOW - 600_000
    await session(db, 'drill', k2)
    await attempts(db, k2, NOW - 1000, [0, 0])
    expect(await countPracticeAnswersToday(db, NOW)).toBe(5)
  })

  it('ignores yesterday (before Manila midnight)', async () => {
    const { db } = makeDb()
    const k = MANILA_MIDNIGHT - 120_000
    await session(db, 'drill', k)
    await attempts(db, k, MANILA_MIDNIGHT - 1, [0, 1, 2])
    expect(await countPracticeAnswersToday(db, NOW)).toBe(0)
  })

  it('leaves out the diagnostic, onboarding, mocks, Study Sprint and flashcards', async () => {
    const { db } = makeDb()
    let k = NOW - 3_600_000
    for (const kind of ['diagnostic', 'onboarding', 'mock', 'sprint']) {
      k += 1000
      await session(db, kind, k)
      await attempts(db, k, NOW - 1000, [0, 1])
    }
    k += 1000
    await session(db, 'flashcard', k)
    await attempts(db, k, NOW - 1000, [0, 1], 'flashcards')
    expect(await countPracticeAnswersToday(db, NOW)).toBe(0)
  })

  it('counts a drill whose rows span several subtests once per question', async () => {
    const { db } = makeDb()
    const k = NOW - 60_000
    await session(db, 'drill', k)
    await db.insert(schema.practiceSessions).values({
      listingSlug: 'upcat', topicId: '', deckId: '', score: 1, total: 1, durationSecs: 60,
      completedAt: k + 60_000, subtest: 'Science', kind: 'drill', attemptKey: k,
    })
    await attempts(db, k, NOW - 1000, [0, 1, 2])
    expect(await countPracticeAnswersToday(db, NOW)).toBe(3)
  })
})

describe('countFullMocks', () => {
  it('counts completed full-mock sittings for one exam (one sitting = many section rows)', async () => {
    const { db } = makeDb()
    await session(db, 'mock', 1000, 'upcat')
    await session(db, 'mock', 1000, 'upcat')
    await session(db, 'mock', 2000, 'upcat')
    await session(db, 'mock', 3000, 'nmat')
    await session(db, 'sprint', 4000, 'upcat')
    await session(db, 'drill', 5000, 'upcat')
    expect(await countFullMocks(db, 'upcat')).toBe(2)
    expect(await countFullMocks(db, 'nmat')).toBe(1)
    expect(await countFullMocks(db, 'pmma')).toBe(0)
  })
})
