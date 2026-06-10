/**
 * TDD tests for the LIKE-based fallback search functions in flashcardRetriever.ts
 * (used on web where FTS5 is unavailable in the sql.js build).
 *
 * Uses better-sqlite3 + drizzle (same as the other retriever tests).
 */

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import type { DrizzleClient } from '../../db/client'
import {
  extractSearchTokens,
  searchFlashcardsLike,
  searchUpcatFactsLike,
  searchCareerFactsLike,
} from '../flashcardRetriever'

// ── Schema helpers ────────────────────────────────────────────────────────────

function makeFlashcardDb(): DrizzleClient {
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
  `)
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

function makeUpcatDb(): DrizzleClient {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE upcat_facts (
      id TEXT PRIMARY KEY NOT NULL,
      topic TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      source TEXT,
      valid_year INTEGER,
      remote_updated_at INTEGER
    );
  `)
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

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
  `)
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

// ── extractSearchTokens ───────────────────────────────────────────────────────

describe('extractSearchTokens', () => {
  it('returns empty array for empty string', () => {
    expect(extractSearchTokens('')).toEqual([])
  })

  it('drops stop-words and short tokens', () => {
    expect(extractSearchTokens('what is the')).toEqual([])
    expect(extractSearchTokens('a an of')).toEqual([])
  })

  it('lowercases and strips punctuation', () => {
    expect(extractSearchTokens('Photosynthesis!')).toEqual(['photosynthesis'])
  })

  it('returns up to 8 tokens', () => {
    const tokens = extractSearchTokens('alpha bravo charlie delta echo foxtrot golf hotel india')
    expect(tokens.length).toBeLessThanOrEqual(8)
  })

  it('extracts content words from a full sentence', () => {
    const tokens = extractSearchTokens('what is photosynthesis in plants')
    expect(tokens).toContain('photosynthesis')
    expect(tokens).toContain('plants')
    expect(tokens).not.toContain('what')
    expect(tokens).not.toContain('is')
  })
})

// ── searchFlashcardsLike ──────────────────────────────────────────────────────

describe('searchFlashcardsLike', () => {
  it('returns [] for empty / stop-word-only query', async () => {
    const db = makeFlashcardDb()
    expect(await searchFlashcardsLike(db, 'what is the')).toEqual([])
    expect(await searchFlashcardsLike(db, '')).toEqual([])
  })

  it('returns [] when no rows match', async () => {
    const db = makeFlashcardDb()
    await db.insert(schema.flashcards).values({
      id: 'f1', topicId: 't1',
      question: 'What is photosynthesis?', answer: 'Plants make food', explanation: 'Uses sunlight',
    })
    expect(await searchFlashcardsLike(db, 'pythagorean theorem')).toEqual([])
  })

  it('matches a keyword present in the question', async () => {
    const db = makeFlashcardDb()
    await db.insert(schema.flashcards).values({
      id: 'f1', topicId: 't1',
      question: 'What is photosynthesis?', answer: 'Plants make food', explanation: 'Uses sunlight',
    })
    const results = await searchFlashcardsLike(db, 'photosynthesis')
    expect(results).toHaveLength(1)
    expect(results[0]!.flashcardId).toBe('f1')
  })

  it('matches a keyword present in the answer field', async () => {
    const db = makeFlashcardDb()
    await db.insert(schema.flashcards).values({
      id: 'f1', topicId: 't1',
      question: 'Q1', answer: 'Photosynthesis is the answer', explanation: '',
    })
    const results = await searchFlashcardsLike(db, 'photosynthesis')
    expect(results).toHaveLength(1)
  })

  it('matches a keyword present in the explanation field', async () => {
    const db = makeFlashcardDb()
    await db.insert(schema.flashcards).values({
      id: 'f1', topicId: 't1',
      question: 'Q1', answer: 'A1', explanation: 'The process involves chlorophyll',
    })
    const results = await searchFlashcardsLike(db, 'chlorophyll')
    expect(results).toHaveLength(1)
  })

  it('ranks higher-hit-count cards first', async () => {
    const db = makeFlashcardDb()
    // Use a query with 2 tokens: 'biology' and 'science'.
    // f1 has ONLY 'science' (1 matching token).
    // f2 has BOTH 'biology' AND 'science' (2 matching tokens → higher score).
    await db.insert(schema.flashcards).values([
      { id: 'f1', topicId: 't1', question: 'Science basics', answer: 'General overview', explanation: 'Introduction' },
      { id: 'f2', topicId: 't2', question: 'Biology and science', answer: 'Life sciences', explanation: 'Introduction' },
    ])
    const results = await searchFlashcardsLike(db, 'biology science', 5)
    // f2 contains both 'biology' and 'science' tokens (score=2); f1 contains only 'science' (score=1)
    expect(results[0]!.flashcardId).toBe('f2')
  })

  it('respects the limit parameter', async () => {
    const db = makeFlashcardDb()
    for (let i = 1; i <= 5; i++) {
      await db.insert(schema.flashcards).values({
        id: `f${i}`, topicId: 't1',
        question: `Math algebra problem ${i}`, answer: 'answer', explanation: '',
      })
    }
    const results = await searchFlashcardsLike(db, 'algebra', 2)
    expect(results).toHaveLength(2)
  })

  it('returns the correct RetrievedFlashcard shape', async () => {
    const db = makeFlashcardDb()
    await db.insert(schema.flashcards).values({
      id: 'f1', topicId: 't42',
      question: 'question text', answer: 'answer text', explanation: 'explanation text',
    })
    const results = await searchFlashcardsLike(db, 'question')
    const r = results[0]!
    expect(r).toEqual(expect.objectContaining({
      flashcardId: 'f1',
      topicId: 't42',
      question: 'question text',
      answer: 'answer text',
      explanation: 'explanation text',
    }))
    expect(typeof r.score).toBe('number')
  })

  it('does not throw when flashcards table is empty', async () => {
    const db = makeFlashcardDb()
    expect(await searchFlashcardsLike(db, 'algebra')).toEqual([])
  })
})

// ── searchUpcatFactsLike ──────────────────────────────────────────────────────

describe('searchUpcatFactsLike', () => {
  it('returns [] for empty query', async () => {
    const db = makeUpcatDb()
    expect(await searchUpcatFactsLike(db, '')).toEqual([])
  })

  it('matches upcat facts by keyword in question or answer', async () => {
    const db = makeUpcatDb()
    await db.insert(schema.upcatFacts).values({
      id: 'uf1', topic: 'Science',
      question: 'What is photosynthesis?', answer: 'Converting sunlight to food',
    })
    const results = await searchUpcatFactsLike(db, 'photosynthesis')
    expect(results).toHaveLength(1)
    expect(results[0]!.topic).toBe('Science')
  })

  it('returns the correct RetrievedUpcatFact shape', async () => {
    const db = makeUpcatDb()
    await db.insert(schema.upcatFacts).values({
      id: 'uf1', topic: 'History',
      question: 'Who is Rizal?', answer: 'National hero',
      source: 'textbook', validYear: 2024,
    })
    const results = await searchUpcatFactsLike(db, 'rizal')
    const r = results[0]!
    expect(r).toEqual(expect.objectContaining({
      topic: 'History',
      question: 'Who is Rizal?',
      answer: 'National hero',
      source: 'textbook',
      validYear: 2024,
    }))
  })

  it('returns [] when no match', async () => {
    const db = makeUpcatDb()
    await db.insert(schema.upcatFacts).values({ id: 'uf1', topic: 'Science', question: 'Plants', answer: 'Grow' })
    expect(await searchUpcatFactsLike(db, 'engineering mathematics')).toEqual([])
  })
})

// ── searchCareerFactsLike ─────────────────────────────────────────────────────

describe('searchCareerFactsLike', () => {
  it('returns [] for empty query', async () => {
    const db = makeCareerDb()
    expect(await searchCareerFactsLike(db, '')).toEqual([])
  })

  it('matches career facts by keyword in course_name or quick_answer', async () => {
    const db = makeCareerDb()
    await db.insert(schema.careerFacts).values({
      id: 'cf1', courseId: 'nursing',
      courseName: 'Nursing', queryType: 'abroad',
      quickAnswer: 'Philippines nurses can work in 30+ countries',
      keyCaveat: 'NCLEX required for USA',
      pointTo: 'career_destinations',
    })
    const results = await searchCareerFactsLike(db, 'nursing abroad')
    expect(results).toHaveLength(1)
    expect(results[0]!.courseName).toBe('Nursing')
  })

  it('returns the correct RetrievedCareerFact shape', async () => {
    const db = makeCareerDb()
    await db.insert(schema.careerFacts).values({
      id: 'cf1', courseId: 'cs',
      courseName: 'Computer Science', queryType: 'salary',
      quickAnswer: 'High earning potential', keyCaveat: 'Competitive market',
      pointTo: null,
    })
    const careerResults = await searchCareerFactsLike(db, 'computer science salary')
    const r = careerResults[0]!
    expect(r).toEqual(expect.objectContaining({
      courseName: 'Computer Science',
      queryType: 'salary',
      quickAnswer: 'High earning potential',
      keyCaveat: 'Competitive market',
    }))
  })

  it('returns [] when no match', async () => {
    const db = makeCareerDb()
    await db.insert(schema.careerFacts).values({
      id: 'cf1', courseId: 'nursing', courseName: 'Nursing',
      quickAnswer: 'Nurses go abroad', keyCaveat: 'NCLEX needed', pointTo: null,
    })
    expect(await searchCareerFactsLike(db, 'engineering software developer')).toEqual([])
  })
})
