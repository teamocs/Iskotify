import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import type { DrizzleClient } from '../../db/client'
import type { HomeStats } from '../../hooks/useHomeStats'
import {
  buildProgressContext,
  loadStudentIdentity,
  formatRetrievedFlashcards,
  buildRetrievedFlashcards,
  buildListingsContext,
  buildCourseConnectionContext,
} from '../chatContext'
import type { RetrievedFlashcard } from '../flashcardRetriever'
import { _clearForTests } from '../queryCache'

function makeDb(): DrizzleClient {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE topics (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE practice_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      listing_slug TEXT NOT NULL DEFAULT '',
      topic_id TEXT NOT NULL DEFAULT '',
      deck_id TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      duration_secs INTEGER NOT NULL DEFAULT 0,
      completed_at INTEGER NOT NULL
    );
    CREATE TABLE user_settings (
      id INTEGER PRIMARY KEY NOT NULL,
      selected_listing_slug TEXT NOT NULL DEFAULT '',
      last_synced_at INTEGER NOT NULL DEFAULT 0,
      full_name TEXT NOT NULL DEFAULT '',
      school TEXT NOT NULL DEFAULT '',
      grade_level INTEGER,
      google_id TEXT,
      email TEXT,
      notifications_enabled INTEGER DEFAULT 1,
      theme TEXT NOT NULL DEFAULT 'system',
      focus_mode_enabled INTEGER NOT NULL DEFAULT 1,
      google_calendar_connected INTEGER NOT NULL DEFAULT 0,
      income_bracket TEXT,
      gwa REAL,
      province TEXT,
      city TEXT,
      hs_gwa_g8 REAL,
      hs_gwa_g9 REAL,
      hs_gwa_g10 REAL,
      hs_gwa_g11 REAL,
      school_type TEXT,
      is_indigenous INTEGER DEFAULT 0,
      target_campus TEXT,
      score_disclaimer_ack INTEGER NOT NULL DEFAULT 0,
      target_exams TEXT NOT NULL DEFAULT '[]',
      target_courses TEXT NOT NULL DEFAULT '[]',
      school_region TEXT NOT NULL DEFAULT '',
      sync_rev INTEGER NOT NULL DEFAULT 0,
      ai_provider TEXT NOT NULL DEFAULT 'local'
    );
  `)
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

const STATS_BASE: HomeStats = {
  listing: { title: 'UPCAT 2026', examDate: Date.now() + 30 * 86400000 },
  daysLeft: 30,
  todayAccuracy: 75,
  streakDays: 5,
  weakTopics: [
    { topicId: 't1', topicName: 'Algebra', accuracy: 32 },
    { topicId: 't2', topicName: 'Biology', accuracy: 45 },
  ],
  firstTopicId: 't1',
  fullName: 'Juan',
  importantDayIndices: [],
  practiceDayIndices: [],
  focusedListings: [],
  noteReminders: [],
  listingAccuracy: {},
  refresh: async () => {},
}

describe('loadStudentIdentity', () => {
  it('returns name + grade + school when all three are present', async () => {
    const db = makeDb()
    await db.insert(schema.userSettings).values({
      id: 1, fullName: 'Juan dela Cruz', school: 'UP Los Baños', gradeLevel: 11,
    })
    const out = await loadStudentIdentity(db)
    expect(out).toBe('Student: Juan dela Cruz (Grade 11, UP Los Baños).')
  })

  it('returns name + grade when school is empty', async () => {
    const db = makeDb()
    await db.insert(schema.userSettings).values({
      id: 1, fullName: 'Maria', school: '', gradeLevel: 12,
    })
    const out = await loadStudentIdentity(db)
    expect(out).toBe('Student: Maria (Grade 12).')
  })

  it('returns name + school when grade is null', async () => {
    const db = makeDb()
    await db.insert(schema.userSettings).values({
      id: 1, fullName: 'Pedro', school: 'PSHS', gradeLevel: null,
    })
    const out = await loadStudentIdentity(db)
    expect(out).toBe('Student: Pedro (PSHS).')
  })

  it('returns name only when school is empty and grade is null', async () => {
    const db = makeDb()
    await db.insert(schema.userSettings).values({
      id: 1, fullName: 'Ana', school: '', gradeLevel: null,
    })
    const out = await loadStudentIdentity(db)
    expect(out).toBe('Student: Ana.')
  })

  it('returns "(anonymous)" when name is empty', async () => {
    const db = makeDb()
    await db.insert(schema.userSettings).values({
      id: 1, fullName: '', school: '', gradeLevel: null,
    })
    const out = await loadStudentIdentity(db)
    expect(out).toBe('Student: (anonymous).')
  })

  it('returns "(anonymous)" when no user_settings row exists', async () => {
    const db = makeDb()
    const out = await loadStudentIdentity(db)
    expect(out).toBe('Student: (anonymous).')
  })
})

describe('buildProgressContext', () => {
  it('returns "no focused exam" message when listing is null', async () => {
    const db = makeDb()
    const stats: HomeStats = { ...STATS_BASE, listing: null }
    const out = await buildProgressContext(db, stats)
    expect(out).toContain('No focused exam')
  })

  it('emits compact 3-line context (Student / Exam line / Weak topics)', async () => {
    const db = makeDb()
    const out = await buildProgressContext(db, STATS_BASE)
    expect(out).toContain('UPCAT 2026')
    expect(out).toContain('30 days')
    expect(out).toContain('5-day streak')
    expect(out).toContain('75% accuracy')
    expect(out.startsWith('Student:')).toBe(true)
    expect(out).not.toContain('Recent sessions')
    expect(out).not.toContain('Streak:')
    expect(out).not.toContain("Today's accuracy:")
  })

  it('lists top 3 weak topics with accuracy percentages', async () => {
    const db = makeDb()
    const out = await buildProgressContext(db, STATS_BASE)
    expect(out).toContain('Weak topics:')
    expect(out).toContain('Algebra (32%)')
    expect(out).toContain('Biology (45%)')
  })

  it('omits the weak topics line when weakTopics is empty', async () => {
    const db = makeDb()
    const stats: HomeStats = { ...STATS_BASE, weakTopics: [] }
    const out = await buildProgressContext(db, stats)
    expect(out).not.toContain('Weak topics:')
  })

  it('omits accuracy phrase (no literal "n/a%") when todayAccuracy is null', async () => {
    const db = makeDb()
    const stats: HomeStats = { ...STATS_BASE, todayAccuracy: null }
    const out = await buildProgressContext(db, stats)
    expect(out).not.toContain('n/a')
    expect(out).not.toContain('Today:')
    expect(out).toContain('5-day streak')  // streak still emitted
  })
})

describe('formatRetrievedFlashcards', () => {
  it('returns null when there are no retrieved cards', () => {
    expect(formatRetrievedFlashcards([])).toBeNull()
  })

  it('formats each card as Q/A/Why block joined by --- separator', () => {
    const cards: RetrievedFlashcard[] = [
      { flashcardId: 'f1', topicId: 't1', question: 'What is photosynthesis?', answer: 'Plants make food from sunlight', explanation: 'Uses chlorophyll', score: -1.5 },
      { flashcardId: 'f2', topicId: 't1', question: 'What is respiration?', answer: 'How cells make energy', explanation: '', score: -1.2 },
    ]
    const out = formatRetrievedFlashcards(cards)!
    expect(out).toContain('Q: What is photosynthesis?')
    expect(out).toContain('A: Plants make food from sunlight')
    expect(out).toContain('Why: Uses chlorophyll')
    expect(out).toContain('---')
    expect(out).toContain('Q: What is respiration?')
    // Empty explanation should NOT produce a "Why:" line for that card
    const respirationBlock = out.split('---').find(b => b.includes('respiration'))!
    expect(respirationBlock).not.toContain('Why:')
  })

  it('truncates over-long fields with ellipsis to bound token cost', () => {
    const longText = 'word '.repeat(100).trim()
    const cards: RetrievedFlashcard[] = [
      { flashcardId: 'f1', topicId: 't1', question: longText, answer: 'A', explanation: '', score: -1 },
    ]
    const out = formatRetrievedFlashcards(cards)!
    expect(out).toMatch(/Q: .{1,140}…/)
  })

  it('collapses internal whitespace before truncating (no jagged formatting)', () => {
    const cards: RetrievedFlashcard[] = [
      { flashcardId: 'f1', topicId: 't1', question: 'Line 1\n\n\n\nLine 2', answer: 'A', explanation: '', score: -1 },
    ]
    const out = formatRetrievedFlashcards(cards)!
    expect(out).toContain('Q: Line 1 Line 2')
  })
})

describe('buildRetrievedFlashcards', () => {
  it('returns null when no flashcards match (graceful empty)', async () => {
    const db = makeDb()
    // makeDb does not create flashcards/flashcards_fts — searchFlashcards
    // catches the SQL error and returns []; format then returns null.
    expect(await buildRetrievedFlashcards(db, 'anything')).toBeNull()
  })
})

describe('buildUpcatFactsBlock', () => {
  function makeDbWithUpcatFacts(): DrizzleClient {
    const raw = new Database(':memory:')
    raw.exec(`
      CREATE TABLE user_settings (
        id INTEGER PRIMARY KEY NOT NULL,
        selected_listing_slug TEXT NOT NULL DEFAULT '',
        last_synced_at INTEGER NOT NULL DEFAULT 0,
        full_name TEXT NOT NULL DEFAULT '',
        school TEXT NOT NULL DEFAULT '',
        grade_level INTEGER,
        google_id TEXT,
        email TEXT,
        notifications_enabled INTEGER DEFAULT 1,
        theme TEXT NOT NULL DEFAULT 'system',
        focus_mode_enabled INTEGER NOT NULL DEFAULT 1,
        google_calendar_connected INTEGER NOT NULL DEFAULT 0,
        income_bracket TEXT,
        gwa REAL,
        province TEXT,
        city TEXT,
        hs_gwa_g8 REAL,
        hs_gwa_g9 REAL,
        hs_gwa_g10 REAL,
        hs_gwa_g11 REAL,
        school_type TEXT,
        is_indigenous INTEGER DEFAULT 0,
        target_campus TEXT,
        score_disclaimer_ack INTEGER NOT NULL DEFAULT 0,
      target_exams TEXT NOT NULL DEFAULT '[]',
      target_courses TEXT NOT NULL DEFAULT '[]',
      school_region TEXT NOT NULL DEFAULT '',
      sync_rev INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS upcat_facts (
        id TEXT PRIMARY KEY NOT NULL, topic TEXT NOT NULL, question TEXT NOT NULL,
        answer TEXT NOT NULL, source TEXT, valid_year INTEGER, remote_updated_at INTEGER
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS upcat_facts_fts USING fts5(
        fact_id UNINDEXED, topic, question, answer,
        tokenize = 'unicode61 remove_diacritics 2'
      );
      CREATE TRIGGER IF NOT EXISTS upcat_facts_fts_ai AFTER INSERT ON upcat_facts BEGIN
        INSERT INTO upcat_facts_fts (fact_id, topic, question, answer) VALUES (new.id, new.topic, new.question, new.answer);
      END;
      CREATE TRIGGER IF NOT EXISTS upcat_facts_fts_ad AFTER DELETE ON upcat_facts BEGIN
        DELETE FROM upcat_facts_fts WHERE fact_id = old.id;
      END;
      CREATE TRIGGER IF NOT EXISTS upcat_facts_fts_au AFTER UPDATE ON upcat_facts BEGIN
        DELETE FROM upcat_facts_fts WHERE fact_id = old.id;
        INSERT INTO upcat_facts_fts (fact_id, topic, question, answer) VALUES (new.id, new.topic, new.question, new.answer);
      END;
    `)
    raw.exec(`
      INSERT INTO upcat_facts (id, topic, question, answer, source, valid_year)
      VALUES ('F1', 'UPG', 'What is the UPG?', 'The University Predicted Grade combines UPCAT + grades.', 'official', 2025);
    `)
    return drizzle(raw, { schema }) as unknown as DrizzleClient
  }

  it('returns a top-level [UPCAT FACTS] block with answer and verify link when facts match', async () => {
    const db = makeDbWithUpcatFacts()
    const result = await buildRetrievedFlashcards(db, 'how does the UPG work')
    expect(result).toContain('[UPCAT FACTS]')
    expect(result).toContain('The University Predicted Grade combines UPCAT + grades.')
    expect(result).toContain('verify at upcat.up.edu.ph')
  })

  it('includes valid_year in the fact line when present', async () => {
    const db = makeDbWithUpcatFacts()
    const result = await buildRetrievedFlashcards(db, 'how does the UPG work')
    expect(result).toContain('as of 2025')
  })

  it('facts-only: output contains [UPCAT FACTS] and does NOT contain a stray empty [RELEVANT FLASHCARDS] header', async () => {
    // With no flashcards table, searchFlashcards returns []; only facts match.
    const db = makeDbWithUpcatFacts()
    const result = await buildRetrievedFlashcards(db, 'how does the UPG work')
    // [UPCAT FACTS] must be present as a top-level section
    expect(result).toContain('[UPCAT FACTS]')
    // [RELEVANT FLASHCARDS] must NOT appear at all (no stray empty header)
    expect(result).not.toContain('[RELEVANT FLASHCARDS]')
  })
})

describe('buildCareerFactsBlock', () => {
  function makeDbWithCareerFacts(): DrizzleClient {
    const raw = new Database(':memory:')
    raw.exec(`
      CREATE TABLE user_settings (
        id INTEGER PRIMARY KEY NOT NULL,
        selected_listing_slug TEXT NOT NULL DEFAULT '',
        last_synced_at INTEGER NOT NULL DEFAULT 0,
        full_name TEXT NOT NULL DEFAULT '',
        school TEXT NOT NULL DEFAULT '',
        grade_level INTEGER,
        google_id TEXT,
        email TEXT,
        notifications_enabled INTEGER DEFAULT 1,
        theme TEXT NOT NULL DEFAULT 'system',
        focus_mode_enabled INTEGER NOT NULL DEFAULT 1,
        google_calendar_connected INTEGER NOT NULL DEFAULT 0,
        income_bracket TEXT,
        gwa REAL,
        province TEXT,
        city TEXT,
        hs_gwa_g8 REAL,
        hs_gwa_g9 REAL,
        hs_gwa_g10 REAL,
        hs_gwa_g11 REAL,
        school_type TEXT,
        is_indigenous INTEGER DEFAULT 0,
        target_campus TEXT,
        score_disclaimer_ack INTEGER NOT NULL DEFAULT 0,
      target_exams TEXT NOT NULL DEFAULT '[]',
      target_courses TEXT NOT NULL DEFAULT '[]',
      school_region TEXT NOT NULL DEFAULT '',
      sync_rev INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS career_facts (
        id TEXT PRIMARY KEY NOT NULL,
        course_name TEXT,
        query_type TEXT,
        quick_answer TEXT,
        key_caveat TEXT,
        point_to TEXT,
        remote_updated_at INTEGER
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS career_facts_fts USING fts5(
        fact_id UNINDEXED, course_name, quick_answer, key_caveat,
        tokenize = 'unicode61 remove_diacritics 2'
      );
      CREATE TRIGGER IF NOT EXISTS career_facts_fts_ai AFTER INSERT ON career_facts BEGIN
        INSERT INTO career_facts_fts (fact_id, course_name, quick_answer, key_caveat)
        VALUES (new.id, new.course_name, new.quick_answer, new.key_caveat);
      END;
      CREATE TRIGGER IF NOT EXISTS career_facts_fts_ad AFTER DELETE ON career_facts BEGIN
        DELETE FROM career_facts_fts WHERE fact_id = old.id;
      END;
      CREATE TRIGGER IF NOT EXISTS career_facts_fts_au AFTER UPDATE ON career_facts BEGIN
        DELETE FROM career_facts_fts WHERE fact_id = old.id;
        INSERT INTO career_facts_fts (fact_id, course_name, quick_answer, key_caveat)
        VALUES (new.id, new.course_name, new.quick_answer, new.key_caveat);
      END;
      CREATE TABLE IF NOT EXISTS ai_career_impact (
        id TEXT PRIMARY KEY NOT NULL,
        course_name TEXT,
        ai_safety_score INTEGER,
        ai_safety_label TEXT,
        kuya_baw_summary TEXT,
        remote_updated_at INTEGER
      );
    `)
    raw.exec(`
      INSERT INTO career_facts (id, course_name, query_type, quick_answer, key_caveat, point_to)
      VALUES (
        'CF1',
        'Nursing',
        'destination_countries',
        'Nursing graduates can work in the US, UK, Canada, and the Middle East.',
        'visa processing can take 2-3 years',
        'DMW/POEA'
      );
      INSERT INTO ai_career_impact (id, course_name, ai_safety_score, ai_safety_label, kuya_baw_summary)
      VALUES (
        'AI1',
        'Computer Science',
        4,
        'Mostly Safe',
        'CS grads who code AI tools are well-positioned; purely routine coding roles face disruption.'
      );
    `)
    return drizzle(raw, { schema }) as unknown as DrizzleClient
  }

  it('returns a [CAREER FACTS] block with quick_answer and verify-with-DMW/POEA when career facts match', async () => {
    const db = makeDbWithCareerFacts()
    const result = await buildRetrievedFlashcards(db, 'where can nursing take me')
    expect(result).toContain('[CAREER FACTS]')
    expect(result).toContain('Nursing graduates can work in the US, UK, Canada, and the Middle East.')
    expect(result).toContain('verify with DMW/POEA')
  })

  it('includes key_caveat in the career fact line when present', async () => {
    const db = makeDbWithCareerFacts()
    const result = await buildRetrievedFlashcards(db, 'where can nursing take me')
    expect(result).toContain('visa processing can take 2-3 years')
  })

  it('returns an [AI CAREER IMPACT] block with AI-Safe-Score and kuya summary when course name matches', async () => {
    const db = makeDbWithCareerFacts()
    const result = await buildRetrievedFlashcards(db, 'is computer science AI-proof')
    expect(result).toContain('[AI CAREER IMPACT]')
    expect(result).toContain('AI-Safe-Score 4/5')
    expect(result).toContain('Mostly Safe')
    expect(result).toContain('CS grads who code AI tools are well-positioned')
  })

  it('[CAREER FACTS] and [AI CAREER IMPACT] are sibling top-level sections (not nested)', async () => {
    const db = makeDbWithCareerFacts()
    // A query about nursing returns career facts but no ai impact (no "nursing" in ai_career_impact)
    const result = await buildRetrievedFlashcards(db, 'where can nursing take me')
    expect(result).toContain('[CAREER FACTS]')
    // [AI CAREER IMPACT] should not appear when course name does not match
    expect(result).not.toContain('[AI CAREER IMPACT]')
  })

  it('a query matching neither career_facts nor ai_career_impact adds neither block', async () => {
    const db = makeDbWithCareerFacts()
    const result = await buildRetrievedFlashcards(db, 'what is photosynthesis')
    expect(result).toBeNull()
  })

  it('career-facts-only: no stray empty [RELEVANT FLASHCARDS] or [UPCAT FACTS] header', async () => {
    const db = makeDbWithCareerFacts()
    const result = await buildRetrievedFlashcards(db, 'where can nursing take me')
    expect(result).toContain('[CAREER FACTS]')
    expect(result).not.toContain('[RELEVANT FLASHCARDS]')
    expect(result).not.toContain('[UPCAT FACTS]')
  })
})

// ── Task 3 TDD: buildListingsContext ──────────────────────────────────────────

describe('buildListingsContext', () => {
  function makeDbWithListings(): DrizzleClient {
    const raw = new Database(':memory:')
    raw.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'published',
        exam_date INTEGER,
        region TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        requirements TEXT NOT NULL DEFAULT '[]',
        coverage TEXT NOT NULL DEFAULT '',
        provider TEXT NOT NULL DEFAULT '',
        external_url TEXT NOT NULL DEFAULT '',
        deadline INTEGER,
        grant_amount TEXT NOT NULL DEFAULT '',
        province TEXT,
        city TEXT,
        scope TEXT NOT NULL DEFAULT 'national',
        is_verified INTEGER NOT NULL DEFAULT 0,
        income_ceiling INTEGER,
        gwa_requirement INTEGER,
        monthly_stipend INTEGER,
        service_obligation_years INTEGER,
        has_entrance_exam INTEGER NOT NULL DEFAULT 0,
        application_window TEXT,
        scholarship_meta TEXT NOT NULL DEFAULT '{}',
        results_date INTEGER,
        target_courses TEXT NOT NULL DEFAULT '[]'
      );
    `)
    // One exam listing: UPCAT 2026
    raw.exec(`
      INSERT INTO listings (id, slug, title, type, status, exam_date, provider)
      VALUES ('L1', 'upcat-2026', 'UPCAT 2026', 'exam', 'published', 1751328000000, 'University of the Philippines');
    `)
    // One scholarship listing: DOST SEI
    raw.exec(`
      INSERT INTO listings (id, slug, title, type, status, deadline, grant_amount, provider)
      VALUES ('L2', 'dost-sei', 'DOST-SEI Merit Scholarship', 'scholarship', 'published', 1748736000000, '₱40,000/year', 'DOST');
    `)
    return drizzle(raw, { schema }) as unknown as DrizzleClient
  }

  it('returns a [LISTINGS] block with title + exam date when question mentions UPCAT', async () => {
    const db = makeDbWithListings()
    const result = await buildListingsContext(db, 'when is the UPCAT?')
    expect(result).toBeDefined()
    expect(result).toContain('[LISTINGS]')
    expect(result).toContain('UPCAT 2026')
  })

  it('returns a [LISTINGS] block for slug match (upcat)', async () => {
    const db = makeDbWithListings()
    const result = await buildListingsContext(db, 'tell me about the upcat')
    expect(result).toBeDefined()
    expect(result).toContain('UPCAT 2026')
  })

  it('returns a [LISTINGS] block with deadline for scholarship question', async () => {
    const db = makeDbWithListings()
    const result = await buildListingsContext(db, 'when is the DOST scholarship deadline?')
    expect(result).toBeDefined()
    expect(result).toContain('[LISTINGS]')
    expect(result).toContain('DOST-SEI Merit Scholarship')
  })

  it('returns undefined when no listing token matches the question', async () => {
    const db = makeDbWithListings()
    const result = await buildListingsContext(db, 'what is photosynthesis?')
    expect(result).toBeUndefined()
  })

  it('limits to at most 2 listings per block', async () => {
    const db = makeDbWithListings()
    // Both "UPCAT" and "DOST" match if we mention both — but result must have at most 2
    const result = await buildListingsContext(db, 'compare UPCAT and DOST scholarship')
    if (result !== undefined) {
      const lines = result.split('\n').filter(l => l.startsWith('-'))
      expect(lines.length).toBeLessThanOrEqual(2)
    }
  })

  it('each listing line stays under 160 chars (token-tight)', async () => {
    const db = makeDbWithListings()
    const result = await buildListingsContext(db, 'when is the UPCAT?')
    if (result !== undefined) {
      const lines = result.split('\n').filter(l => l.startsWith('-'))
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(160)
      }
    }
  })
})

// ── Task 3 TDD: buildCourseConnectionContext ──────────────────────────────────

describe('buildCourseConnectionContext', () => {
  function makeDbWithCourses(): DrizzleClient {
    const raw = new Database(':memory:')
    raw.exec(`
      CREATE TABLE career_courses (
        course_id TEXT PRIMARY KEY NOT NULL,
        name TEXT,
        cluster TEXT,
        career_tag TEXT,
        demand TEXT,
        board_exam INTEGER NOT NULL DEFAULT 0,
        board_exam_name TEXT,
        duration_years REAL,
        top_countries TEXT NOT NULL DEFAULT '[]',
        summary TEXT,
        student_tip TEXT,
        ai_note TEXT,
        remote_updated_at INTEGER
      );
      CREATE TABLE listings (
        id TEXT PRIMARY KEY NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'published',
        exam_date INTEGER,
        region TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        requirements TEXT NOT NULL DEFAULT '[]',
        coverage TEXT NOT NULL DEFAULT '',
        provider TEXT NOT NULL DEFAULT '',
        external_url TEXT NOT NULL DEFAULT '',
        deadline INTEGER,
        grant_amount TEXT NOT NULL DEFAULT '',
        province TEXT,
        city TEXT,
        scope TEXT NOT NULL DEFAULT 'national',
        is_verified INTEGER NOT NULL DEFAULT 0,
        income_ceiling INTEGER,
        gwa_requirement INTEGER,
        monthly_stipend INTEGER,
        service_obligation_years INTEGER,
        has_entrance_exam INTEGER NOT NULL DEFAULT 0,
        application_window TEXT,
        scholarship_meta TEXT NOT NULL DEFAULT '{}',
        results_date INTEGER,
        target_courses TEXT NOT NULL DEFAULT '[]'
      );
      CREATE TABLE focus_listings (
        listing_slug TEXT PRIMARY KEY NOT NULL,
        priority INTEGER NOT NULL,
        added_at INTEGER NOT NULL
      );
    `)
    // Nursing course
    raw.exec(`
      INSERT INTO career_courses (course_id, name, cluster, demand, board_exam, board_exam_name)
      VALUES ('C1', 'Nursing', 'Health Sciences', 'High', 1, 'Nursing Board Exam');
    `)
    // UPCAT listing accepts Health Sciences
    raw.exec(`
      INSERT INTO listings (id, slug, title, type, status, target_courses)
      VALUES ('L1', 'upcat-2026', 'UPCAT 2026', 'exam', 'published', '["Health Sciences"]');
    `)
    // DOST scholarship open to all
    raw.exec(`
      INSERT INTO listings (id, slug, title, type, status, target_courses)
      VALUES ('L2', 'dost-sei', 'DOST-SEI Merit Scholarship', 'scholarship', 'published', '["all"]');
    `)
    // User has both focused
    raw.exec(`
      INSERT INTO focus_listings (listing_slug, priority, added_at) VALUES ('upcat-2026', 1, 0);
      INSERT INTO focus_listings (listing_slug, priority, added_at) VALUES ('dost-sei', 2, 0);
    `)
    return drizzle(raw, { schema }) as unknown as DrizzleClient
  }

  it('returns a [COURSES] block with cluster, board exam, and demand when course name matches', async () => {
    const db = makeDbWithCourses()
    const result = await buildCourseConnectionContext(db, 'is nursing a good course?')
    expect(result).toBeDefined()
    expect(result).toContain('[COURSES]')
    expect(result).toContain('Nursing')
    expect(result).toContain('Health Sciences')
    expect(result).toContain('Nursing Board Exam')
  })

  it('includes focused listings that accept the matched course cluster', async () => {
    const db = makeDbWithCourses()
    const result = await buildCourseConnectionContext(db, 'is nursing a good course?')
    expect(result).toBeDefined()
    expect(result).toContain('UPCAT 2026')
  })

  it('includes "all" listings (DOST) in the accepted-by set', async () => {
    const db = makeDbWithCourses()
    const result = await buildCourseConnectionContext(db, 'is nursing a good course?')
    expect(result).toBeDefined()
    expect(result).toContain('DOST-SEI')
  })

  it('returns undefined when no course name matches the question', async () => {
    const db = makeDbWithCourses()
    const result = await buildCourseConnectionContext(db, 'what is photosynthesis?')
    expect(result).toBeUndefined()
  })

  it('limits to at most 2 courses', async () => {
    const db = makeDbWithCourses()
    const result = await buildCourseConnectionContext(db, 'is nursing a good course?')
    if (result !== undefined) {
      const lines = result.split('\n').filter(l => l.startsWith('-'))
      expect(lines.length).toBeLessThanOrEqual(2)
    }
  })
})

// ── C1 TDD: queryCache integration for context builders ───────────────────────
//
// Strategy: use the real in-memory SQLite DB but wrap `db.select` in a
// Jest spy so we can count the actual SQL calls made to the DB.  The spy
// is set up on the drizzle instance before calling the builder; we then
// call the builder a second time (same question, cache still warm) and
// assert the spy was called exactly once across both invocations.
//
// _clearForTests() is called in beforeEach so cache state from other
// describe blocks does not leak into these tests.

describe('C1: buildListingsContext — db read cached after first call', () => {
  function makeDbWithListingsForCache(): DrizzleClient {
    const raw = new Database(':memory:')
    raw.exec(`
      CREATE TABLE listings (
        id TEXT PRIMARY KEY NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'published',
        exam_date INTEGER,
        region TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        requirements TEXT NOT NULL DEFAULT '[]',
        coverage TEXT NOT NULL DEFAULT '',
        provider TEXT NOT NULL DEFAULT '',
        external_url TEXT NOT NULL DEFAULT '',
        deadline INTEGER,
        grant_amount TEXT NOT NULL DEFAULT '',
        province TEXT,
        city TEXT,
        scope TEXT NOT NULL DEFAULT 'national',
        is_verified INTEGER NOT NULL DEFAULT 0,
        income_ceiling INTEGER,
        gwa_requirement INTEGER,
        monthly_stipend INTEGER,
        service_obligation_years INTEGER,
        has_entrance_exam INTEGER NOT NULL DEFAULT 0,
        application_window TEXT,
        scholarship_meta TEXT NOT NULL DEFAULT '{}',
        results_date INTEGER,
        target_courses TEXT NOT NULL DEFAULT '[]'
      );
    `)
    raw.exec(`
      INSERT INTO listings (id, slug, title, type, status, exam_date, provider)
      VALUES ('L1', 'upcat-2026', 'UPCAT 2026', 'exam', 'published', 1751328000000, 'UP');
    `)
    return drizzle(raw, { schema }) as unknown as DrizzleClient
  }

  beforeEach(() => {
    // Reset queryCache state so tests are fully isolated.
    _clearForTests()
  })

  it('calls the db fetcher only once across two buildListingsContext calls with different questions', async () => {
    const db = makeDbWithListingsForCache()

    // Spy on the real drizzle select to count actual DB hits.
    // The cachedQuery fetcher wraps db.select(); after the first call the
    // result is in the in-memory cache and the fetcher is NOT invoked again.
    let fetcherCallCount = 0
    const originalSelect = db.select.bind(db)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(db as any).select = (...args: any[]) => {
      fetcherCallCount++
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return originalSelect(...(args as [any]))
    }

    // First call — cache miss, fetcher runs once (for the listings-meta key).
    await buildListingsContext(db, 'when is the UPCAT?')

    // Second call with a different question — cache hit, fetcher must NOT run again.
    await buildListingsContext(db, 'tell me about the upcat exam')

    // The listings table select should have been called exactly once total.
    expect(fetcherCallCount).toBe(1)
  })

  it('returns correct result on second call (cache hit returns same rows)', async () => {
    const db = makeDbWithListingsForCache()

    const first = await buildListingsContext(db, 'when is the UPCAT?')
    const second = await buildListingsContext(db, 'upcat details')

    // Both calls should resolve to equivalent results (both match UPCAT).
    expect(first).toContain('UPCAT 2026')
    expect(second).toContain('UPCAT 2026')
  })
})

describe('C1: buildCourseConnectionContext — db reads cached after first call', () => {
  function makeDbWithCoursesForCache(): DrizzleClient {
    const raw = new Database(':memory:')
    raw.exec(`
      CREATE TABLE career_courses (
        course_id TEXT PRIMARY KEY NOT NULL,
        name TEXT,
        cluster TEXT,
        career_tag TEXT,
        demand TEXT,
        board_exam INTEGER NOT NULL DEFAULT 0,
        board_exam_name TEXT,
        duration_years REAL,
        top_countries TEXT NOT NULL DEFAULT '[]',
        summary TEXT,
        student_tip TEXT,
        ai_note TEXT,
        remote_updated_at INTEGER
      );
      CREATE TABLE listings (
        id TEXT PRIMARY KEY NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'published',
        exam_date INTEGER,
        region TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        requirements TEXT NOT NULL DEFAULT '[]',
        coverage TEXT NOT NULL DEFAULT '',
        provider TEXT NOT NULL DEFAULT '',
        external_url TEXT NOT NULL DEFAULT '',
        deadline INTEGER,
        grant_amount TEXT NOT NULL DEFAULT '',
        province TEXT,
        city TEXT,
        scope TEXT NOT NULL DEFAULT 'national',
        is_verified INTEGER NOT NULL DEFAULT 0,
        income_ceiling INTEGER,
        gwa_requirement INTEGER,
        monthly_stipend INTEGER,
        service_obligation_years INTEGER,
        has_entrance_exam INTEGER NOT NULL DEFAULT 0,
        application_window TEXT,
        scholarship_meta TEXT NOT NULL DEFAULT '{}',
        results_date INTEGER,
        target_courses TEXT NOT NULL DEFAULT '[]'
      );
      CREATE TABLE focus_listings (
        listing_slug TEXT PRIMARY KEY NOT NULL,
        priority INTEGER NOT NULL,
        added_at INTEGER NOT NULL
      );
    `)
    raw.exec(`
      INSERT INTO career_courses (course_id, name, cluster, demand, board_exam, board_exam_name)
      VALUES ('C1', 'Nursing', 'Health Sciences', 'High', 1, 'Nursing Board Exam');
      INSERT INTO listings (id, slug, title, type, status, target_courses)
      VALUES ('L1', 'upcat-2026', 'UPCAT 2026', 'exam', 'published', '["Health Sciences"]');
      INSERT INTO focus_listings (listing_slug, priority, added_at) VALUES ('upcat-2026', 1, 0);
    `)
    return drizzle(raw, { schema }) as unknown as DrizzleClient
  }

  beforeEach(() => {
    _clearForTests()
  })

  it('does not re-fetch careerCourses or focusListings tables on second call (both cached)', async () => {
    const db = makeDbWithCoursesForCache()

    // Track calls to the two stable cached fetchers by key.
    // cachedQuery stores the fetcher closure; we spy on db.select to count
    // how many times the raw table reads actually hit the DB.
    // The builder also has one un-cached conditional select (focused listing
    // details), which we account for separately.
    let fetcherCallCount = 0
    const originalSelect = db.select.bind(db)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(db as any).select = (...args: any[]) => {
      fetcherCallCount++
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return originalSelect(...(args as [any]))
    }

    // First call — cache miss for chat:course-meta and chat:focus-meta.
    // Also one un-cached select for focused listing details (conditional).
    await buildCourseConnectionContext(db, 'is nursing a good course?')
    const countAfterFirst = fetcherCallCount

    // Sanity: at least the 2 cached selects ran on the first call.
    expect(countAfterFirst).toBeGreaterThanOrEqual(2)

    // Second call — chat:course-meta and chat:focus-meta are both cache hits;
    // only the un-cached conditional focused-listing-details select runs again.
    await buildCourseConnectionContext(db, 'tell me about nursing careers')
    const countAfterSecond = fetcherCallCount

    // Exactly 1 select on the second call (the conditional focused-listing
    // details) — proves BOTH cached table reads were served from cache.
    expect(countAfterSecond - countAfterFirst).toBe(1)
  })
})
