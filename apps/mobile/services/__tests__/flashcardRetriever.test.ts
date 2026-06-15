import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import type { DrizzleClient } from '../../db/client'
import { buildFtsQuery, searchFlashcards, searchCareerFacts, getAiImpactByCourseName } from '../flashcardRetriever'

function makeDbWithFts(): DrizzleClient {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE flashcards (
      id TEXT PRIMARY KEY NOT NULL,
      topic_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      explanation TEXT NOT NULL,
      listing_slugs TEXT NOT NULL DEFAULT '[]',
      options TEXT NOT NULL DEFAULT '[]',
      correct_answer_index INTEGER,
      remote_updated_at INTEGER,
      ai_options TEXT,
      ai_correct_index INTEGER,
      ai_explanation TEXT,
      ai_enhanced_at INTEGER,
      status TEXT NOT NULL DEFAULT 'published'
    );
    CREATE VIRTUAL TABLE flashcards_fts USING fts5(
      flashcard_id UNINDEXED,
      topic_id UNINDEXED,
      question,
      answer,
      explanation,
      tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER flashcards_fts_ai AFTER INSERT ON flashcards BEGIN
      INSERT INTO flashcards_fts (flashcard_id, topic_id, question, answer, explanation)
      VALUES (new.id, new.topic_id, new.question, new.answer, new.explanation);
    END;
    CREATE TRIGGER flashcards_fts_ad AFTER DELETE ON flashcards BEGIN
      DELETE FROM flashcards_fts WHERE flashcard_id = old.id;
    END;
    CREATE TRIGGER flashcards_fts_au AFTER UPDATE ON flashcards BEGIN
      DELETE FROM flashcards_fts WHERE flashcard_id = old.id;
      INSERT INTO flashcards_fts (flashcard_id, topic_id, question, answer, explanation)
      VALUES (new.id, new.topic_id, new.question, new.answer, new.explanation);
    END;
  `)
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

async function seed(db: DrizzleClient, rows: Array<{
  id: string; topicId: string; question: string; answer: string; explanation: string
}>): Promise<void> {
  for (const r of rows) {
    await db.insert(schema.flashcards).values({
      id: r.id,
      topicId: r.topicId,
      question: r.question,
      answer: r.answer,
      explanation: r.explanation,
    })
  }
}

describe('buildFtsQuery', () => {
  it('returns empty string for empty/whitespace input', () => {
    expect(buildFtsQuery('')).toBe('')
    expect(buildFtsQuery('   ')).toBe('')
  })

  it('drops stop-words and short tokens', () => {
    expect(buildFtsQuery('what is the')).toBe('')
    expect(buildFtsQuery('a an of')).toBe('')
  })

  it('produces a prefix-search OR expression for content words', () => {
    expect(buildFtsQuery('photosynthesis')).toBe('photosynthesis*')
    expect(buildFtsQuery('what is photosynthesis')).toBe('photosynthesis*')
  })

  it('joins multiple content words with OR (prefix on each)', () => {
    expect(buildFtsQuery('rizal noli me tangere')).toBe('rizal* OR noli* OR tangere*')
  })

  it('lowercases and strips punctuation safely (no FTS5 syntax injection)', () => {
    expect(buildFtsQuery('What is photosynthesis?')).toBe('photosynthesis*')
    expect(buildFtsQuery('Rizal"; DROP TABLE--')).toBe('rizal* OR drop* OR table*')
  })

  it('caps the expression at 8 tokens to keep MATCH bounded', () => {
    const longQuery = 'algebra biology calculus chemistry geometry history language literature physics statistics'
    const out = buildFtsQuery(longQuery)
    expect(out.split(' OR ')).toHaveLength(8)
  })
})

describe('searchFlashcards (FTS5 integration)', () => {
  it('returns [] when the query has no usable tokens', async () => {
    const db = makeDbWithFts()
    await seed(db, [
      { id: 'f1', topicId: 't1', question: 'Photo', answer: 'X', explanation: 'Y' },
    ])
    expect(await searchFlashcards(db, 'what is the')).toEqual([])
  })

  it('returns [] when nothing matches', async () => {
    const db = makeDbWithFts()
    await seed(db, [
      { id: 'f1', topicId: 't1', question: 'Photosynthesis', answer: 'Plant food', explanation: 'Sunlight' },
    ])
    expect(await searchFlashcards(db, 'pythagorean')).toEqual([])
  })

  it('matches single keyword via FTS5 prefix search', async () => {
    const db = makeDbWithFts()
    await seed(db, [
      { id: 'f1', topicId: 't1', question: 'What is photosynthesis?', answer: 'Plants make food', explanation: 'Sunlight + chlorophyll' },
      { id: 'f2', topicId: 't2', question: 'Who wrote Noli Me Tangere?', answer: 'Jose Rizal', explanation: 'Filipino novelist' },
    ])
    const results = await searchFlashcards(db, 'photosynthesis')
    expect(results).toHaveLength(1)
    expect(results[0]!.flashcardId).toBe('f1')
    expect(results[0]!.question).toContain('photosynthesis')
  })

  it('ranks more-relevant flashcards higher (BM25)', async () => {
    const db = makeDbWithFts()
    await seed(db, [
      { id: 'f1', topicId: 't1', question: 'Random unrelated card', answer: 'noli', explanation: '' },
      { id: 'f2', topicId: 't2', question: 'Who wrote Noli Me Tangere?', answer: 'Jose Rizal', explanation: 'Noli is his novel about colonial Spain' },
    ])
    const results = await searchFlashcards(db, 'noli me tangere', 5)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]!.flashcardId).toBe('f2')
  })

  it('respects the limit parameter', async () => {
    const db = makeDbWithFts()
    await seed(db, [
      { id: 'f1', topicId: 't1', question: 'Algebra basics', answer: 'a', explanation: '' },
      { id: 'f2', topicId: 't1', question: 'Algebra advanced', answer: 'b', explanation: '' },
      { id: 'f3', topicId: 't1', question: 'Algebra equations', answer: 'c', explanation: '' },
      { id: 'f4', topicId: 't1', question: 'Algebra word problems', answer: 'd', explanation: '' },
    ])
    expect(await searchFlashcards(db, 'algebra', 2)).toHaveLength(2)
    expect(await searchFlashcards(db, 'algebra', 4)).toHaveLength(4)
  })

  it('matches across question, answer, AND explanation fields', async () => {
    const db = makeDbWithFts()
    await seed(db, [
      { id: 'f1', topicId: 't1', question: 'Random q', answer: 'Random a', explanation: 'mentions photosynthesis' },
    ])
    const results = await searchFlashcards(db, 'photosynthesis')
    expect(results).toHaveLength(1)
    expect(results[0]!.flashcardId).toBe('f1')
  })

  it('returns the full RetrievedFlashcard shape', async () => {
    const db = makeDbWithFts()
    await seed(db, [
      { id: 'f1', topicId: 't42', question: 'question text', answer: 'answer text', explanation: 'explanation text' },
    ])
    const [r] = await searchFlashcards(db, 'question')
    expect(r).toEqual(expect.objectContaining({
      flashcardId: 'f1',
      topicId: 't42',
      question: 'question text',
      answer: 'answer text',
      explanation: 'explanation text',
    }))
    expect(typeof r!.score).toBe('number')
  })

  it('does not throw and returns [] when the FTS table is missing', async () => {
    const raw = new Database(':memory:')
    raw.exec(`CREATE TABLE flashcards (id TEXT PRIMARY KEY, topic_id TEXT, question TEXT, answer TEXT, explanation TEXT, listing_slugs TEXT, options TEXT, correct_answer_index INTEGER, remote_updated_at INTEGER, ai_options TEXT, ai_correct_index INTEGER, ai_explanation TEXT, ai_enhanced_at INTEGER)`)
    const db = drizzle(raw, { schema }) as unknown as DrizzleClient
    expect(await searchFlashcards(db, 'anything')).toEqual([])
  })
})

// ── Career Facts FTS helpers ──────────────────────────────────────────────────

function makeCareerDb(): DrizzleClient {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE career_facts (
      id TEXT PRIMARY KEY NOT NULL,
      course_id TEXT,
      query_type TEXT,
      course_name TEXT,
      quick_answer TEXT,
      key_caveat TEXT,
      point_to TEXT,
      remote_updated_at INTEGER
    );
    CREATE VIRTUAL TABLE career_facts_fts USING fts5(
      fact_id UNINDEXED,
      course_name,
      quick_answer,
      key_caveat,
      tokenize = 'unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER career_facts_fts_ai AFTER INSERT ON career_facts BEGIN
      INSERT INTO career_facts_fts (fact_id, course_name, quick_answer, key_caveat)
      VALUES (new.id, new.course_name, new.quick_answer, new.key_caveat);
    END;
    CREATE TRIGGER career_facts_fts_ad AFTER DELETE ON career_facts BEGIN
      DELETE FROM career_facts_fts WHERE fact_id = old.id;
    END;
    CREATE TRIGGER career_facts_fts_au AFTER UPDATE ON career_facts BEGIN
      DELETE FROM career_facts_fts WHERE fact_id = old.id;
      INSERT INTO career_facts_fts (fact_id, course_name, quick_answer, key_caveat)
      VALUES (new.id, new.course_name, new.quick_answer, new.key_caveat);
    END;
    CREATE TABLE ai_career_impact (
      course_id TEXT PRIMARY KEY NOT NULL,
      course_name TEXT,
      cluster TEXT,
      board_exam INTEGER NOT NULL DEFAULT 0,
      board_exam_name TEXT,
      automation_risk_low INTEGER,
      automation_risk_high INTEGER,
      ai_safety_score INTEGER,
      ai_safety_label TEXT,
      color_code TEXT,
      what_ai_takes_over TEXT NOT NULL DEFAULT '[]',
      what_stays_human TEXT NOT NULL DEFAULT '[]',
      new_jobs_emerging TEXT NOT NULL DEFAULT '[]',
      skills_to_develop TEXT NOT NULL DEFAULT '[]',
      career_outlook_2030 TEXT,
      key_stat TEXT,
      key_source TEXT,
      key_quote TEXT,
      quote_by TEXT,
      ph_advantage TEXT,
      ph_notes TEXT,
      kuya_baw_summary TEXT,
      last_updated TEXT,
      remote_updated_at INTEGER
    );
  `)
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

describe('searchCareerFacts (FTS5 integration)', () => {
  it('returns matching career fact for a course_name query', async () => {
    const db = makeCareerDb()
    const raw = (db as any).session?.client ?? (db as any)._session?.client
    // Insert via raw SQL to avoid drizzle schema mismatch on in-memory test DB
    const sqlite = new Database(':memory:')
    // Re-use the drizzle db's underlying sqlite by reconstructing
    const raw2 = new Database(':memory:')
    raw2.exec(`
      CREATE TABLE career_facts (id TEXT PRIMARY KEY, course_id TEXT, query_type TEXT, course_name TEXT, quick_answer TEXT, key_caveat TEXT, point_to TEXT, remote_updated_at INTEGER);
      CREATE VIRTUAL TABLE career_facts_fts USING fts5(fact_id UNINDEXED, course_name, quick_answer, key_caveat, tokenize = 'unicode61 remove_diacritics 2');
      CREATE TRIGGER career_facts_fts_ai AFTER INSERT ON career_facts BEGIN INSERT INTO career_facts_fts (fact_id, course_name, quick_answer, key_caveat) VALUES (new.id, new.course_name, new.quick_answer, new.key_caveat); END;
      CREATE TABLE ai_career_impact (course_id TEXT PRIMARY KEY, course_name TEXT, cluster TEXT, board_exam INTEGER NOT NULL DEFAULT 0, board_exam_name TEXT, automation_risk_low INTEGER, automation_risk_high INTEGER, ai_safety_score INTEGER, ai_safety_label TEXT, color_code TEXT, what_ai_takes_over TEXT NOT NULL DEFAULT '[]', what_stays_human TEXT NOT NULL DEFAULT '[]', new_jobs_emerging TEXT NOT NULL DEFAULT '[]', skills_to_develop TEXT NOT NULL DEFAULT '[]', career_outlook_2030 TEXT, key_stat TEXT, key_source TEXT, key_quote TEXT, quote_by TEXT, ph_advantage TEXT, ph_notes TEXT, kuya_baw_summary TEXT, last_updated TEXT, remote_updated_at INTEGER);
      INSERT INTO career_facts VALUES ('cf1', 'nursing', 'abroad', 'Nursing', 'Philippines nurses can work in 30+ countries', 'NCLEX required for USA', 'career_destinations', NULL);
    `)
    const db2 = drizzle(raw2, { schema }) as unknown as DrizzleClient
    const results = await searchCareerFacts(db2, 'nursing abroad countries', 3)
    expect(results).toHaveLength(1)
    const first = results[0]!
    expect(first.courseName).toBe('Nursing')
    expect(first.quickAnswer).toContain('Philippines nurses')
  })

  it('returns [] for a no-match query', async () => {
    const raw = new Database(':memory:')
    raw.exec(`
      CREATE TABLE career_facts (id TEXT PRIMARY KEY, course_id TEXT, query_type TEXT, course_name TEXT, quick_answer TEXT, key_caveat TEXT, point_to TEXT, remote_updated_at INTEGER);
      CREATE VIRTUAL TABLE career_facts_fts USING fts5(fact_id UNINDEXED, course_name, quick_answer, key_caveat, tokenize = 'unicode61 remove_diacritics 2');
      CREATE TRIGGER career_facts_fts_ai AFTER INSERT ON career_facts BEGIN INSERT INTO career_facts_fts (fact_id, course_name, quick_answer, key_caveat) VALUES (new.id, new.course_name, new.quick_answer, new.key_caveat); END;
      CREATE TABLE ai_career_impact (course_id TEXT PRIMARY KEY, course_name TEXT, cluster TEXT, board_exam INTEGER NOT NULL DEFAULT 0, board_exam_name TEXT, automation_risk_low INTEGER, automation_risk_high INTEGER, ai_safety_score INTEGER, ai_safety_label TEXT, color_code TEXT, what_ai_takes_over TEXT NOT NULL DEFAULT '[]', what_stays_human TEXT NOT NULL DEFAULT '[]', new_jobs_emerging TEXT NOT NULL DEFAULT '[]', skills_to_develop TEXT NOT NULL DEFAULT '[]', career_outlook_2030 TEXT, key_stat TEXT, key_source TEXT, key_quote TEXT, quote_by TEXT, ph_advantage TEXT, ph_notes TEXT, kuya_baw_summary TEXT, last_updated TEXT, remote_updated_at INTEGER);
      INSERT INTO career_facts VALUES ('cf1', 'nursing', 'abroad', 'Nursing', 'Nurses go abroad', 'NCLEX needed', 'career_destinations', NULL);
    `)
    const db = drizzle(raw, { schema }) as unknown as DrizzleClient
    const results = await searchCareerFacts(db, 'engineering software developer', 3)
    expect(results).toEqual([])
  })

  it('returns [] and does not throw when FTS table is missing', async () => {
    const raw = new Database(':memory:')
    raw.exec(`CREATE TABLE career_facts (id TEXT PRIMARY KEY, course_id TEXT, query_type TEXT, course_name TEXT, quick_answer TEXT, key_caveat TEXT, point_to TEXT, remote_updated_at INTEGER)`)
    const db = drizzle(raw, { schema }) as unknown as DrizzleClient
    expect(await searchCareerFacts(db, 'nursing')).toEqual([])
  })
})

describe('getAiImpactByCourseName', () => {
  function makeAiDb(): { db: DrizzleClient } {
    const raw = new Database(':memory:')
    raw.exec(`
      CREATE TABLE career_facts (id TEXT PRIMARY KEY, course_id TEXT, query_type TEXT, course_name TEXT, quick_answer TEXT, key_caveat TEXT, point_to TEXT, remote_updated_at INTEGER);
      CREATE VIRTUAL TABLE career_facts_fts USING fts5(fact_id UNINDEXED, course_name, quick_answer, key_caveat, tokenize = 'unicode61 remove_diacritics 2');
      CREATE TRIGGER career_facts_fts_ai AFTER INSERT ON career_facts BEGIN INSERT INTO career_facts_fts (fact_id, course_name, quick_answer, key_caveat) VALUES (new.id, new.course_name, new.quick_answer, new.key_caveat); END;
      CREATE TABLE ai_career_impact (
        course_id TEXT PRIMARY KEY,
        course_name TEXT,
        cluster TEXT,
        board_exam INTEGER NOT NULL DEFAULT 0,
        board_exam_name TEXT,
        automation_risk_low INTEGER,
        automation_risk_high INTEGER,
        ai_safety_score INTEGER,
        ai_safety_label TEXT,
        color_code TEXT,
        what_ai_takes_over TEXT NOT NULL DEFAULT '[]',
        what_stays_human TEXT NOT NULL DEFAULT '[]',
        new_jobs_emerging TEXT NOT NULL DEFAULT '[]',
        skills_to_develop TEXT NOT NULL DEFAULT '[]',
        career_outlook_2030 TEXT,
        key_stat TEXT,
        key_source TEXT,
        key_quote TEXT,
        quote_by TEXT,
        ph_advantage TEXT,
        ph_notes TEXT,
        kuya_baw_summary TEXT,
        last_updated TEXT,
        remote_updated_at INTEGER
      );
      INSERT INTO ai_career_impact (course_id, course_name, ai_safety_score, ai_safety_label, kuya_baw_summary)
        VALUES ('cs01', 'Computer Science', 72, 'Moderate Risk', 'CS grads should focus on AI collaboration skills.');
    `)
    return { db: drizzle(raw, { schema }) as unknown as DrizzleClient }
  }

  it('returns the ai_career_impact row for a matching course name', async () => {
    const { db } = makeAiDb()
    const result = await getAiImpactByCourseName(db, 'Computer Science')
    expect(result).not.toBeNull()
    expect(result!.courseName).toBe('Computer Science')
    expect(result!.aiSafetyScore).toBe(72)
    expect(result!.aiSafetyLabel).toBe('Moderate Risk')
    expect(result!.kuyaBawSummary).toContain('CS grads')
  })

  it('returns null when no course name matches', async () => {
    const { db } = makeAiDb()
    const result = await getAiImpactByCourseName(db, 'Basket Weaving')
    expect(result).toBeNull()
  })

  it('returns null and does not throw when table is missing', async () => {
    const raw = new Database(':memory:')
    raw.exec(`CREATE TABLE career_facts (id TEXT PRIMARY KEY, course_id TEXT, query_type TEXT, course_name TEXT, quick_answer TEXT, key_caveat TEXT, point_to TEXT, remote_updated_at INTEGER)`)
    const db = drizzle(raw, { schema }) as unknown as DrizzleClient
    expect(await getAiImpactByCourseName(db, 'Computer Science')).toBeNull()
  })

  it('returns null for empty/blank name input', async () => {
    const { db } = makeAiDb()
    expect(await getAiImpactByCourseName(db, '')).toBeNull()
    expect(await getAiImpactByCourseName(db, '   ')).toBeNull()
  })
})
