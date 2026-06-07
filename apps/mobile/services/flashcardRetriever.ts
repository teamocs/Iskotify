import { sql } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'

export interface RetrievedFlashcard {
  flashcardId: string
  topicId: string
  question: string
  answer: string
  explanation: string
  score: number
}

// Common English stop-words that are useless for retrieval and create OR-noise.
// Kept short — we strip the worst offenders, not every adverb.
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by',
  'do', 'does', 'did', 'for', 'from', 'has', 'have', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'me', 'my',
  'no', 'not', 'of', 'on', 'or', 'so', 'that', 'the', 'their',
  'them', 'then', 'this', 'to', 'too', 'was', 'were', 'what',
  'when', 'where', 'which', 'who', 'why', 'will', 'with', 'you', 'your',
])

/**
 * Turn a natural-language question into an FTS5 MATCH expression.
 *
 *   "what is photosynthesis?" → 'photosynthesis*'
 *   "rizal noli me tangere"   → 'rizal* OR noli* OR tangere*'
 *
 * - Lowercased and split on non-word chars (safe for FTS5 syntax).
 * - Drops short (<3) and stop-word tokens.
 * - Adds a trailing `*` per token (prefix search) so partial words match.
 * - Joins with OR so any subset of terms can hit; BM25 ranks the rest.
 *
 * Returns empty string when no usable tokens remain — callers must skip the
 * MATCH query in that case (FTS5 throws on empty patterns).
 */
export function buildFtsQuery(question: string): string {
  const tokens = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t))
  if (tokens.length === 0) return ''
  // Cap at 8 tokens to keep the MATCH expression bounded and predictable.
  return tokens.slice(0, 8).map(t => `${t}*`).join(' OR ')
}

/**
 * Retrieve the top-K most relevant flashcards for a question via SQLite FTS5
 * BM25 ranking. Returns [] when the query has no usable terms or no rows match.
 * Never throws — failures are logged and treated as "no results" so chat keeps
 * working when the FTS table is missing or corrupt.
 */
export async function searchFlashcards(
  db: DrizzleClient,
  question: string,
  limit = 3,
): Promise<RetrievedFlashcard[]> {
  const match = buildFtsQuery(question)
  if (!match) return []
  try {
    const rows = await db.all<{
      flashcard_id: string
      topic_id: string
      question: string
      answer: string
      explanation: string
      score: number
    }>(sql`
      SELECT
        flashcard_id,
        topic_id,
        question,
        answer,
        explanation,
        bm25(flashcards_fts) AS score
      FROM flashcards_fts
      WHERE flashcards_fts MATCH ${match}
      ORDER BY bm25(flashcards_fts)
      LIMIT ${limit}
    `)
    return rows.map(r => ({
      flashcardId: r.flashcard_id,
      topicId: r.topic_id,
      question: r.question,
      answer: r.answer,
      explanation: r.explanation,
      score: r.score,
    }))
  } catch (err) {
    console.warn('[flashcardRetriever] search failed:', err)
    return []
  }
}

export interface RetrievedUpcatFact {
  topic: string
  question: string
  answer: string
  source: string | null
  validYear: number | null
}

/**
 * Retrieve the top-K most relevant UPCAT facts for a question via SQLite FTS5
 * BM25 ranking. Mirrors searchFlashcards exactly — same buildFtsQuery sanitizer,
 * same raw-SQL mechanism, same ordering by BM25 score.
 * Never throws — failures are logged and treated as "no results".
 */
export async function searchUpcatFacts(
  db: DrizzleClient,
  question: string,
  limit = 3,
): Promise<RetrievedUpcatFact[]> {
  const match = buildFtsQuery(question)
  if (!match) return []
  try {
    const rows = await db.all<{
      topic: string
      question: string
      answer: string
      source: string | null
      valid_year: number | null
    }>(sql`
      SELECT
        f.topic,
        f.question,
        f.answer,
        f.source,
        f.valid_year
      FROM upcat_facts_fts fts
      JOIN upcat_facts f ON f.id = fts.fact_id
      WHERE upcat_facts_fts MATCH ${match}
      ORDER BY bm25(upcat_facts_fts)
      LIMIT ${limit}
    `)
    return rows.map(r => ({
      topic: r.topic,
      question: r.question,
      answer: r.answer,
      source: r.source,
      validYear: r.valid_year,
    }))
  } catch (err) {
    console.warn('[flashcardRetriever] upcat facts search failed:', err)
    return []
  }
}

export interface RetrievedCareerFact {
  courseName: string | null
  queryType: string | null
  quickAnswer: string | null
  keyCaveat: string | null
  pointTo: string | null
}

/**
 * Retrieve the top-K most relevant career facts for a query via SQLite FTS5
 * BM25 ranking. Mirrors searchUpcatFacts exactly — same buildFtsQuery sanitizer,
 * same raw-SQL mechanism, JOIN on career_facts_fts → career_facts.
 * Never throws — failures are logged and treated as "no results".
 */
export async function searchCareerFacts(
  db: DrizzleClient,
  query: string,
  limit = 3,
): Promise<RetrievedCareerFact[]> {
  const match = buildFtsQuery(query)
  if (!match) return []
  try {
    const rows = await db.all<{
      course_name: string | null
      query_type: string | null
      quick_answer: string | null
      key_caveat: string | null
      point_to: string | null
    }>(sql`
      SELECT
        f.course_name,
        f.query_type,
        f.quick_answer,
        f.key_caveat,
        f.point_to
      FROM career_facts_fts fts
      JOIN career_facts f ON f.id = fts.fact_id
      WHERE career_facts_fts MATCH ${match}
      ORDER BY bm25(career_facts_fts)
      LIMIT ${limit}
    `)
    return rows.map(r => ({
      courseName: r.course_name,
      queryType: r.query_type,
      quickAnswer: r.quick_answer,
      keyCaveat: r.key_caveat,
      pointTo: r.point_to,
    }))
  } catch (err) {
    console.warn('[flashcardRetriever] career facts search failed:', err)
    return []
  }
}

export interface RetrievedAiImpact {
  courseName: string | null
  aiSafetyScore: number | null
  aiSafetyLabel: string | null
  kuyaBawSummary: string | null
}

/**
 * Look up an AI career impact row by course name (case-insensitive LIKE match).
 * Returns the first match or null. Never throws — failures are logged and
 * treated as "not found" so chat keeps working when the table is missing.
 */
export async function getAiImpactByCourseName(
  db: DrizzleClient,
  name: string,
): Promise<RetrievedAiImpact | null> {
  if (!name || !name.trim()) return null
  try {
    const rows = await db.all<{
      course_name: string | null
      ai_safety_score: number | null
      ai_safety_label: string | null
      kuya_baw_summary: string | null
    }>(sql`
      SELECT
        course_name,
        ai_safety_score,
        ai_safety_label,
        kuya_baw_summary
      FROM ai_career_impact
      WHERE LOWER(course_name) LIKE LOWER(${`%${name.trim()}%`})
      LIMIT 1
    `)
    if (rows.length === 0 || rows[0] == null) return null
    const r = rows[0]
    return {
      courseName: r.course_name,
      aiSafetyScore: r.ai_safety_score,
      aiSafetyLabel: r.ai_safety_label,
      kuyaBawSummary: r.kuya_baw_summary,
    }
  } catch (err) {
    console.warn('[flashcardRetriever] ai impact lookup failed:', err)
    return null
  }
}

/**
 * Find an AI career impact row where the user's question contains the course name
 * (reverse LIKE match). Used when the user asks about a specific course by name
 * in a longer question, e.g. "is computer science AI-proof?".
 * Returns the first match or null. Never throws.
 */
export async function searchAiImpactByQuestion(
  db: DrizzleClient,
  question: string,
): Promise<RetrievedAiImpact | null> {
  if (!question || !question.trim()) return null
  try {
    const rows = await db.all<{
      course_name: string | null
      ai_safety_score: number | null
      ai_safety_label: string | null
      kuya_baw_summary: string | null
    }>(sql`
      SELECT
        course_name,
        ai_safety_score,
        ai_safety_label,
        kuya_baw_summary
      FROM ai_career_impact
      WHERE LOWER(${question.trim()}) LIKE '%' || LOWER(course_name) || '%'
      LIMIT 1
    `)
    if (rows.length === 0 || rows[0] == null) return null
    const r = rows[0]
    return {
      courseName: r.course_name,
      aiSafetyScore: r.ai_safety_score,
      aiSafetyLabel: r.ai_safety_label,
      kuyaBawSummary: r.kuya_baw_summary,
    }
  } catch (err) {
    console.warn('[flashcardRetriever] ai impact search failed:', err)
    return null
  }
}
