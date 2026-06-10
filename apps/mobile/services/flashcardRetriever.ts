import { sql, like, or } from 'drizzle-orm'
import { Platform } from 'react-native'
import type { DrizzleClient } from '../db/client'
import { flashcards as flashcardsTable, upcatFacts as upcatFactsTable, careerFacts as careerFactsTable } from '../db/schema'

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
 * Extract searchable tokens from a query string (same stop-word logic as
 * buildFtsQuery but returns the raw token array for use in LIKE expressions).
 * Exported for unit testing.
 */
export function extractSearchTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t))
    .slice(0, 8)
}

// ── LIKE-based fallback search (used on web where FTS5 is unavailable) ─────

/**
 * Count how many terms from `tokens` appear in `text` (case-insensitive).
 * Used as a lightweight relevance proxy when BM25 is unavailable.
 */
function countHits(tokens: string[], text: string): number {
  const lower = text.toLowerCase()
  return tokens.filter(t => lower.includes(t)).length
}

/**
 * LIKE-based flashcard search for environments without FTS5 (web).
 *
 * Splits the query into tokens, then for each token builds a LIKE '%token%'
 * condition across question + answer + explanation (OR'd). Rows that match
 * any token are returned; they are sorted by descending hit-count (simple
 * relevance proxy for BM25) and capped at `limit`.
 *
 * Never throws — failures are logged and treated as "no results".
 */
export async function searchFlashcardsLike(
  db: DrizzleClient,
  question: string,
  limit = 3,
): Promise<RetrievedFlashcard[]> {
  const tokens = extractSearchTokens(question)
  if (tokens.length === 0) return []
  try {
    // Build OR-chain: each token checked across all three text columns
    const conditions = tokens.flatMap(t => [
      like(flashcardsTable.question, `%${t}%`),
      like(flashcardsTable.answer, `%${t}%`),
      like(flashcardsTable.explanation, `%${t}%`),
    ])
    const rows = await db
      .select({
        flashcardId: flashcardsTable.id,
        topicId: flashcardsTable.topicId,
        question: flashcardsTable.question,
        answer: flashcardsTable.answer,
        explanation: flashcardsTable.explanation,
      })
      .from(flashcardsTable)
      .where(or(...conditions))
      .limit(limit * 3) // over-fetch so we can re-rank by hit count
    // Sort by number of token hits (descending) and cap at limit
    return rows
      .map(r => ({
        ...r,
        score: countHits(tokens, `${r.question} ${r.answer} ${r.explanation}`),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  } catch (err) {
    console.warn('[flashcardRetriever] LIKE search failed:', err)
    return []
  }
}

/**
 * LIKE-based UPCAT facts search for environments without FTS5 (web).
 * Mirrors searchUpcatFacts shape/contract.
 * Never throws.
 */
export async function searchUpcatFactsLike(
  db: DrizzleClient,
  question: string,
  limit = 3,
): Promise<RetrievedUpcatFact[]> {
  const tokens = extractSearchTokens(question)
  if (tokens.length === 0) return []
  try {
    const conditions = tokens.flatMap(t => [
      like(upcatFactsTable.question, `%${t}%`),
      like(upcatFactsTable.answer, `%${t}%`),
      like(upcatFactsTable.topic, `%${t}%`),
    ])
    const rows = await db
      .select({
        topic: upcatFactsTable.topic,
        question: upcatFactsTable.question,
        answer: upcatFactsTable.answer,
        source: upcatFactsTable.source,
        validYear: upcatFactsTable.validYear,
      })
      .from(upcatFactsTable)
      .where(or(...conditions))
      .limit(limit * 3)
    return rows
      .map(r => ({
        ...r,
        _hits: countHits(tokens, `${r.topic} ${r.question} ${r.answer}`),
      }))
      .sort((a, b) => b._hits - a._hits)
      .slice(0, limit)
      .map(({ _hits: _h, ...r }) => r)
  } catch (err) {
    console.warn('[flashcardRetriever] UPCAT LIKE search failed:', err)
    return []
  }
}

/**
 * LIKE-based career facts search for environments without FTS5 (web).
 * Mirrors searchCareerFacts shape/contract.
 * Never throws.
 */
export async function searchCareerFactsLike(
  db: DrizzleClient,
  query: string,
  limit = 3,
): Promise<RetrievedCareerFact[]> {
  const tokens = extractSearchTokens(query)
  if (tokens.length === 0) return []
  try {
    const conditions = tokens.flatMap(t => [
      like(careerFactsTable.courseName, `%${t}%`),
      like(careerFactsTable.quickAnswer, `%${t}%`),
      like(careerFactsTable.keyCaveat, `%${t}%`),
    ])
    const rows = await db
      .select({
        courseName: careerFactsTable.courseName,
        queryType: careerFactsTable.queryType,
        quickAnswer: careerFactsTable.quickAnswer,
        keyCaveat: careerFactsTable.keyCaveat,
        pointTo: careerFactsTable.pointTo,
      })
      .from(careerFactsTable)
      .where(or(...conditions))
      .limit(limit * 3)
    return rows
      .map(r => ({
        ...r,
        _hits: countHits(tokens, `${r.courseName ?? ''} ${r.quickAnswer ?? ''} ${r.keyCaveat ?? ''}`),
      }))
      .sort((a, b) => b._hits - a._hits)
      .slice(0, limit)
      .map(({ _hits: _h, ...r }) => r)
  } catch (err) {
    console.warn('[flashcardRetriever] career LIKE search failed:', err)
    return []
  }
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

// ── Platform-aware auto wrappers ──────────────────────────────────────────────
//
// On web, expo-sqlite's FTS5 virtual tables are not created (sql.js skips them).
// Calling the FTS variants throws and returns []. The *Auto wrappers detect
// Platform.OS === 'web' at call-time and route to the LIKE fallback instead.
//
// Design choice: thin wrappers here rather than branching inside chatContext so
// that (a) the platform logic lives in one place next to the implementations it
// selects between, and (b) chatContext stays clean — one import, one call per
// retriever. The LIKE variants are never imported into the native bundle path,
// which keeps the native bundle size unchanged (tree-shaking eliminates dead
// exports; here they're all in the same file so that argument is moot, but the
// code flow is at least clear).
//
// searchAiImpactByQuestion already uses plain SQL LIKE — no auto wrapper needed.

/**
 * searchFlashcardsAuto — uses FTS on native, LIKE fallback on web.
 */
export function searchFlashcardsAuto(
  db: DrizzleClient,
  question: string,
  limit = 3,
): Promise<RetrievedFlashcard[]> {
  return Platform.OS === 'web'
    ? searchFlashcardsLike(db, question, limit)
    : searchFlashcards(db, question, limit)
}

/**
 * searchUpcatFactsAuto — uses FTS on native, LIKE fallback on web.
 */
export function searchUpcatFactsAuto(
  db: DrizzleClient,
  question: string,
  limit = 3,
): Promise<RetrievedUpcatFact[]> {
  return Platform.OS === 'web'
    ? searchUpcatFactsLike(db, question, limit)
    : searchUpcatFacts(db, question, limit)
}

/**
 * searchCareerFactsAuto — uses FTS on native, LIKE fallback on web.
 */
export function searchCareerFactsAuto(
  db: DrizzleClient,
  query: string,
  limit = 3,
): Promise<RetrievedCareerFact[]> {
  return Platform.OS === 'web'
    ? searchCareerFactsLike(db, query, limit)
    : searchCareerFacts(db, query, limit)
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
      WHERE LENGTH(course_name) >= 5
        AND LOWER(${question.trim()}) LIKE '%' || LOWER(course_name) || '%'
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
