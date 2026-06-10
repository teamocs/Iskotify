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
} from '../chatContext'
import type { RetrievedFlashcard } from '../flashcardRetriever'

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
      sync_rev INTEGER NOT NULL DEFAULT 0
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
