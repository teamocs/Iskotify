/**
 * batchUpsert — chunked multi-row upserts for syncOnLaunch (P1 perf audit).
 *
 * Uses a REAL in-memory SQLite (better-sqlite3) through the real drizzle
 * client, exactly like sync.test.ts / syncHeal.test.ts, so the multi-row
 * `INSERT ... ON CONFLICT DO UPDATE SET col = excluded."col"` SQL that
 * batchUpsert generates is validated end-to-end against the same drizzle
 * version the app ships (0.38.x on expo-sqlite natively / sql.js on web —
 * identical query-builder API).
 */

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { getTableColumns } from 'drizzle-orm'
import * as schema from '../../db/schema'
import { subjects, flashcards, universityProfiles } from '../../db/schema'
import { batchUpsert } from '../syncBatch'

function makeDb() {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE subjects (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL
    );
    CREATE TABLE flashcards (
      id TEXT PRIMARY KEY NOT NULL,
      topic_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      explanation TEXT NOT NULL,
      listing_slugs TEXT NOT NULL DEFAULT '[]',
      remote_updated_at INTEGER,
      options TEXT NOT NULL DEFAULT '[]',
      correct_answer_index INTEGER,
      ai_options TEXT,
      ai_correct_index INTEGER,
      ai_explanation TEXT,
      ai_enhanced_at INTEGER,
      status TEXT NOT NULL DEFAULT 'published'
    );
    CREATE TABLE university_profiles (
      school_id TEXT PRIMARY KEY NOT NULL,
      data_tier TEXT,
      institution_type TEXT,
      year_established TEXT,
      known_for_courses TEXT NOT NULL DEFAULT '[]',
      prc_top_courses TEXT NOT NULL DEFAULT '[]',
      ched_coe_cod TEXT,
      accreditation TEXT,
      entrance_exam_name TEXT,
      entrance_exam_acronym TEXT,
      testing_center_type TEXT,
      application_open TEXT,
      application_close TEXT,
      exam_month TEXT,
      estimated_passing_rate TEXT,
      estimated_slots TEXT,
      tuition_fee_range TEXT,
      free_tuition INTEGER,
      academic_calendar TEXT,
      courses_offered TEXT NOT NULL DEFAULT '[]',
      scholarships_offered TEXT NOT NULL DEFAULT '[]',
      website_url TEXT,
      application_portal_url TEXT,
      facebook_url TEXT,
      exam_difficulty INTEGER,
      notable_programs TEXT NOT NULL DEFAULT '[]',
      prc_strong_boards TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      data_confidence TEXT,
      remote_updated_at INTEGER
    );
  `)
  const db = drizzle(raw, { schema })
  return { raw, db }
}

/**
 * Wrap a drizzle tx so we can count how many INSERT statements batchUpsert
 * issues and how many rows each statement carried (chunking assertions).
 */
function makeCountingTx(tx: any) {
  const chunkSizes: number[] = []
  const counting = {
    insert: (table: any) => {
      const builder = tx.insert(table)
      return {
        values: (rows: any[]) => {
          chunkSizes.push(rows.length)
          return builder.values(rows)
        },
      }
    },
  }
  return { counting, chunkSizes }
}

function makeProfileRow(i: number, overrides: Record<string, unknown> = {}) {
  return {
    schoolId: `school-${i}`,
    dataTier: 'tier1',
    institutionType: 'SUC',
    yearEstablished: '1908',
    knownForCourses: '["law"]',
    prcTopCourses: '[]',
    chedCoeCod: null,
    accreditation: null,
    entranceExamName: `Exam ${i}`,
    entranceExamAcronym: null,
    testingCenterType: null,
    applicationOpen: null,
    applicationClose: null,
    examMonth: null,
    estimatedPassingRate: null,
    estimatedSlots: null,
    tuitionFeeRange: null,
    freeTuition: true,
    academicCalendar: null,
    coursesOffered: '[]',
    scholarshipsOffered: '[]',
    websiteUrl: null,
    applicationPortalUrl: null,
    facebookUrl: null,
    examDifficulty: i,
    notablePrograms: '[]',
    prcStrongBoards: '[]',
    notes: null,
    dataConfidence: 'high',
    remoteUpdatedAt: 1000 + i,
    ...overrides,
  }
}

describe('batchUpsert', () => {
  it('inserts new rows', () => {
    const { raw, db } = makeDb()
    db.transaction((tx) => {
      batchUpsert(tx, subjects, [
        { id: 's1', name: 'Math' },
        { id: 's2', name: 'Science' },
        { id: 's3', name: 'Reading' },
      ], subjects.id)
    })
    const rows = raw.prepare('SELECT * FROM subjects ORDER BY id').all() as any[]
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ id: 's1', name: 'Math' })
    expect(rows[2]).toEqual({ id: 's3', name: 'Reading' })
  })

  it('is a no-op for empty input (no statements issued)', () => {
    const { raw, db } = makeDb()
    db.transaction((tx) => {
      const { counting, chunkSizes } = makeCountingTx(tx)
      batchUpsert(counting as any, subjects, [], subjects.id)
      expect(chunkSizes).toHaveLength(0)
    })
    const rows = raw.prepare('SELECT * FROM subjects').all()
    expect(rows).toHaveLength(0)
  })

  it('updates existing rows on conflict — values actually overwritten (incl. null overwrites)', () => {
    const { raw, db } = makeDb()
    raw.prepare(`
      INSERT INTO flashcards (id, topic_id, question, answer, explanation, listing_slugs, options, correct_answer_index, remote_updated_at, status)
      VALUES ('fc-1', 't-old', 'old Q', 'old A', 'old E', '["old"]', '["x"]', 3, 1, 'published')
    `).run()

    db.transaction((tx) => {
      batchUpsert(tx, flashcards, [{
        id: 'fc-1',
        topicId: 't-new',
        question: 'new Q',
        answer: 'new A',
        explanation: 'new E',
        listingSlugs: '["new"]',
        options: '["a","b"]',
        correctAnswerIndex: null,   // explicit null must overwrite 3
        remoteUpdatedAt: 2000,
        status: 'draft',
      }], flashcards.id)
    })

    const row = raw.prepare('SELECT * FROM flashcards WHERE id = ?').get('fc-1') as any
    expect(row.topic_id).toBe('t-new')
    expect(row.question).toBe('new Q')
    expect(row.answer).toBe('new A')
    expect(row.explanation).toBe('new E')
    expect(row.listing_slugs).toBe('["new"]')
    expect(row.options).toBe('["a","b"]')
    expect(row.correct_answer_index).toBeNull()
    expect(row.remote_updated_at).toBe(2000)
    expect(row.status).toBe('draft')
  })

  it('handles mixed insert + update in ONE call', () => {
    const { raw, db } = makeDb()
    raw.prepare('INSERT INTO subjects (id, name) VALUES (?, ?)').run('s1', 'Old Math')

    db.transaction((tx) => {
      batchUpsert(tx, subjects, [
        { id: 's1', name: 'New Math' },   // update
        { id: 's2', name: 'Science' },    // insert
      ], subjects.id)
    })

    const rows = raw.prepare('SELECT * FROM subjects ORDER BY id').all() as any[]
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ id: 's1', name: 'New Math' })
    expect(rows[1]).toEqual({ id: 's2', name: 'Science' })
  })

  it('columns absent from the rows are NOT touched on update (preserve-local-ai-work semantics)', () => {
    const { raw, db } = makeDb()
    // Pre-seed a card WITH local ai_* work
    raw.prepare(`
      INSERT INTO flashcards (id, topic_id, question, answer, explanation, listing_slugs, options, correct_answer_index, remote_updated_at,
        ai_options, ai_correct_index, ai_explanation, ai_enhanced_at)
      VALUES ('fc-1', 't1', 'Q', 'A', 'E', '[]', '[]', 0, 1, '["LocalW1"]', 1, 'local reason', 555)
    `).run()

    // Upsert the same card WITHOUT any ai_* keys — base fields update, ai_* survives
    db.transaction((tx) => {
      batchUpsert(tx, flashcards, [{
        id: 'fc-1', topicId: 't1', question: 'Q v2', answer: 'A v2', explanation: 'E v2',
        listingSlugs: '["upcat"]', options: '[]', correctAnswerIndex: 0,
        remoteUpdatedAt: 2, status: 'published',
      }], flashcards.id)
    })

    const row = raw.prepare('SELECT * FROM flashcards WHERE id = ?').get('fc-1') as any
    expect(row.question).toBe('Q v2')
    expect(row.remote_updated_at).toBe(2)
    // Local ai_* work untouched
    expect(row.ai_options).toBe('["LocalW1"]')
    expect(row.ai_correct_index).toBe(1)
    expect(row.ai_explanation).toBe('local reason')
    expect(row.ai_enhanced_at).toBe(555)
  })

  it('columns present in the rows DO overwrite (ai_* included when provided)', () => {
    const { raw, db } = makeDb()
    raw.prepare(`
      INSERT INTO flashcards (id, topic_id, question, answer, explanation, listing_slugs, options, correct_answer_index, remote_updated_at,
        ai_options, ai_correct_index, ai_explanation, ai_enhanced_at)
      VALUES ('fc-1', 't1', 'Q', 'A', 'E', '[]', '[]', 0, 1, '["OldW1"]', 0, 'old reason', 555)
    `).run()

    db.transaction((tx) => {
      batchUpsert(tx, flashcards, [{
        id: 'fc-1', topicId: 't1', question: 'Q', answer: 'A', explanation: 'E',
        listingSlugs: '[]', options: '[]', correctAnswerIndex: 0,
        remoteUpdatedAt: 2, status: 'published',
        aiOptions: '["NewW1"]', aiCorrectIndex: 2, aiExplanation: 'new reason', aiEnhancedAt: 999,
      }], flashcards.id)
    })

    const row = raw.prepare('SELECT * FROM flashcards WHERE id = ?').get('fc-1') as any
    expect(row.ai_options).toBe('["NewW1"]')
    expect(row.ai_correct_index).toBe(2)
    expect(row.ai_explanation).toBe('new reason')
    expect(row.ai_enhanced_at).toBe(999)
  })

  it('chunks a wide table (universityProfiles, 30 cols) so no statement exceeds the 999-param bound', () => {
    const { raw, db } = makeDb()
    const colCount = Object.keys(getTableColumns(universityProfiles)).length
    expect(colCount).toBe(30)
    const expectedChunk = Math.max(1, Math.floor(900 / colCount)) // 30 rows/chunk

    const rows = Array.from({ length: 100 }, (_, i) => makeProfileRow(i))
    // 100 rows × 30 cols = 3000 bound params unchunked — well over SQLite's 999 limit
    let chunkSizes: number[] = []
    db.transaction((tx) => {
      const wrapped = makeCountingTx(tx)
      batchUpsert(wrapped.counting as any, universityProfiles, rows as any, universityProfiles.schoolId)
      chunkSizes = wrapped.chunkSizes
    })

    expect(chunkSizes).toEqual([30, 30, 30, 10])
    for (const size of chunkSizes) {
      expect(size).toBeLessThanOrEqual(expectedChunk)
      expect(size * colCount).toBeLessThanOrEqual(900)
    }

    const count = (raw.prepare('SELECT COUNT(*) AS n FROM university_profiles').get() as any).n
    expect(count).toBe(100)
    const first = raw.prepare('SELECT * FROM university_profiles WHERE school_id = ?').get('school-0') as any
    expect(first.entrance_exam_name).toBe('Exam 0')
    expect(first.free_tuition).toBe(1)
    expect(first.remote_updated_at).toBe(1000)
    const last = raw.prepare('SELECT * FROM university_profiles WHERE school_id = ?').get('school-99') as any
    expect(last.exam_difficulty).toBe(99)
  })

  it('chunked upsert UPDATES across chunk boundaries too (wide table re-run with new values)', () => {
    const { raw, db } = makeDb()
    const rows = Array.from({ length: 100 }, (_, i) => makeProfileRow(i))
    db.transaction((tx) => {
      batchUpsert(tx, universityProfiles, rows as any, universityProfiles.schoolId)
    })
    // Second pass with changed values — every row (first, middle chunk, last) overwritten
    const updated = Array.from({ length: 100 }, (_, i) =>
      makeProfileRow(i, { dataTier: 'tier2', remoteUpdatedAt: 9000 + i }))
    db.transaction((tx) => {
      batchUpsert(tx, universityProfiles, updated as any, universityProfiles.schoolId)
    })

    const count = (raw.prepare('SELECT COUNT(*) AS n FROM university_profiles').get() as any).n
    expect(count).toBe(100)
    for (const i of [0, 45, 99]) {
      const row = raw.prepare('SELECT * FROM university_profiles WHERE school_id = ?').get(`school-${i}`) as any
      expect(row.data_tier).toBe('tier2')
      expect(row.remote_updated_at).toBe(9000 + i)
    }
  })

  it('chunks a narrow table into few large statements (subjects, 2 cols → 450 rows/chunk)', () => {
    const { raw, db } = makeDb()
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: `s-${i}`, name: `Subject ${i}` }))
    let chunkSizes: number[] = []
    db.transaction((tx) => {
      const wrapped = makeCountingTx(tx)
      batchUpsert(wrapped.counting as any, subjects, rows, subjects.id)
      chunkSizes = wrapped.chunkSizes
    })
    expect(chunkSizes).toEqual([450, 450, 100])

    const count = (raw.prepare('SELECT COUNT(*) AS n FROM subjects').get() as any).n
    expect(count).toBe(1000)
    expect((raw.prepare('SELECT name FROM subjects WHERE id = ?').get('s-999') as any).name).toBe('Subject 999')
  })
})
