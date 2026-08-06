/**
 * services/analyticsAggregates.ts
 *
 * Pure aggregate helpers for the v2 analytics dashboard (Task G), consuming
 * the question_attempts telemetry Task D introduced (per-question elapsedMs +
 * wrong-answer records) plus practice_sessions (for the accuracy trend and
 * percentile-band history).
 *
 * All functions are plain JS over already-fetched arrays — no React, no SQL —
 * matching hooks/useAnalytics.ts's own computeWeeklyData/computeTopicMastery
 * convention rather than homeAggregates.ts's SQL-aggregate convention. That's
 * a deliberate choice here: question_attempts is capped at MAX_RETAINED_ATTEMPTS
 * (5000 rows, see utils/attemptRetention.ts) specifically so full-table JS
 * aggregation stays cheap, and useAnalytics.ts already fetches practice_sessions
 * in full for the same reason — reusing that fetched array avoids a second
 * DB round-trip for the trend/percentile functions below.
 *
 * Two data-quality caveats these functions must never violate (see Task D
 * review notes):
 *   1. Diagnostic bundled-fallback questions are tagged sourceTable
 *      'upcat_questions' even though their content comes from bundled JSON,
 *      not the local upcat_questions table — a join against upcat_questions
 *      can silently miss them. None of the functions below join against
 *      upcat_questions at all (mistake grouping uses only the attempt row's
 *      own topic/subtest fields), which sidesteps that fragility entirely.
 *   2. `topic` coverage on attempt rows is PARTIAL for the diagnostic/
 *      upcat-legacy engines (diagnostic always writes topic: null) and FULL
 *      for blueprint mocks. Every grouping function below falls back to
 *      `subtest` when `topic` is absent, and drops a row from topic-shaped
 *      aggregates only when BOTH are absent — it is still counted in the
 *      time/accuracy aggregates that don't need a topic.
 */

import { estimatePercentileBand, type PercentileBand } from '../utils/examBuilder'

// ── Shared input shape ───────────────────────────────────────────────────────

/** The subset of a question_attempts row every aggregate below needs. */
export interface AttemptRecord {
  sourceTable: string
  questionId: string
  listingSlug: string
  subtest: string | null
  topic: string | null
  /**
   * null means the question was never answered (buildAttemptRows'
   * skip convention — utils/attemptRows.ts:52-70) — distinct from a wrong
   * pick. Every consumer that treats `correct: false` as "a mistake" must
   * check this first: a skip is "ran out of time", not "doesn't know it".
   */
  selectedIndex: number | null
  correct: boolean
  elapsedMs: number
  answeredAt: number
}

// ── Avg time per question ────────────────────────────────────────────────────

export interface SubjectTimeStat {
  subject: string
  avgMs: number
  count: number
}

export interface AvgTimeResult {
  overallAvgMs: number | null
  overallCount: number
  bySubject: SubjectTimeStat[]
}

/**
 * computeAvgTimePerQuestion — mean elapsedMs overall + per subject (subtest).
 *
 * Rows with elapsedMs <= 0 are excluded from the average (0 means "not
 * timed" — e.g. a row written by a build that predates per-question timing —
 * not "answered instantly"), but are otherwise valid attempt rows elsewhere.
 * Per-subject breakdown further requires a non-empty `subtest`; rows with no
 * subtest (deck/topic-only flashcard runs with no subject tag) still count
 * toward the overall average.
 */
export function computeAvgTimePerQuestion(attempts: AttemptRecord[]): AvgTimeResult {
  const timed = attempts.filter(a => a.elapsedMs > 0)

  const overallAvgMs = timed.length > 0
    ? Math.round(timed.reduce((sum, a) => sum + a.elapsedMs, 0) / timed.length)
    : null

  const bySubjectAcc = new Map<string, { sum: number; count: number }>()
  for (const a of timed) {
    const key = a.subtest?.trim()
    if (!key) continue
    const cur = bySubjectAcc.get(key) ?? { sum: 0, count: 0 }
    cur.sum += a.elapsedMs
    cur.count += 1
    bySubjectAcc.set(key, cur)
  }

  const bySubject = Array.from(bySubjectAcc.entries())
    .map(([subject, v]) => ({ subject, avgMs: Math.round(v.sum / v.count), count: v.count }))
    .sort((a, b) => b.count - a.count)

  return { overallAvgMs, overallCount: timed.length, bySubject }
}

// ── Most common mistakes (topic-grouped) ─────────────────────────────────────

export interface MissedTopicRaw {
  /** sourceTable + the raw topic/subtest key that grouped this bucket — stable, not for display. */
  groupKey: string
  sourceTable: string
  /** Raw topic value from the attempt row. For sourceTable 'flashcards' this IS a topics.id.
   *  For 'upcat_questions' it's a free-text taxonomy label (or null). */
  rawTopic: string | null
  subtest: string | null
  listingSlug: string
  /** Genuinely answered wrong (selectedIndex !== null) — the actual mistakes. Ranking key. */
  wrongCount: number
  /** Never answered (selectedIndex === null, buildAttemptRows' skip convention) — "ran out of
   *  time", not "doesn't know it". Tracked separately so it never masquerades as a mistake. */
  skipCount: number
  /** wrongCount + skipCount — every non-correct attempt, kept for the miss-rate calc below. */
  missCount: number
  attemptCount: number
  missRate: number
  lastMissedAt: number
}

/**
 * computeMostMissedTopics — group attempts by topic (falling back to subtest
 * when topic is absent), counting wrong answers and skips SEPARATELY. A row
 * with neither topic nor subtest can't be attributed to any group and is
 * skipped (partial topic coverage caveat above) — it still contributes to
 * computeAvgTimePerQuestion's overall average, just not here.
 *
 * Finding 1: a skipped question (selectedIndex: null, correct: false — a
 * section abandoned under time pressure) is not a conceptual error, so it
 * must never inflate a topic's ranking the way a genuine wrong answer does.
 * wrongCount/skipCount are reported independently for the UI to show both
 * ("12 wrong · 3 skipped"), and the sort ranks by wrongCount first.
 *
 * Returns every group with at least one non-correct attempt (wrong or
 * skipped), sorted by wrong-answer count desc, then miss rate desc, then
 * skip count desc. Caller slices to a display limit after resolving labels
 * (resolveMissedTopicLabels) since the limit is a display concern.
 */
export function computeMostMissedTopics(attempts: AttemptRecord[]): MissedTopicRaw[] {
  const grouped = new Map<string, MissedTopicRaw & { _latestAt: number }>()

  for (const a of attempts) {
    const topicKey = a.topic?.trim() || null
    const subtestKey = a.subtest?.trim() || null
    if (!topicKey && !subtestKey) continue

    const groupKey = `${a.sourceTable}::${topicKey ?? `subtest:${subtestKey}`}`
    const cur = grouped.get(groupKey) ?? {
      groupKey,
      sourceTable: a.sourceTable,
      rawTopic: topicKey,
      subtest: subtestKey,
      listingSlug: a.listingSlug,
      wrongCount: 0,
      skipCount: 0,
      missCount: 0,
      attemptCount: 0,
      missRate: 0,
      lastMissedAt: 0,
      _latestAt: 0,
    }

    cur.attemptCount += 1
    if (!a.correct) {
      if (a.selectedIndex === null) {
        cur.skipCount += 1
      } else {
        cur.wrongCount += 1
      }
      cur.missCount += 1
      cur.lastMissedAt = Math.max(cur.lastMissedAt, a.answeredAt)
    }
    // Keep the most-recently-seen listingSlug/subtest for display (a topic
    // can theoretically be practiced under different listings over time).
    if (a.answeredAt >= cur._latestAt) {
      cur._latestAt = a.answeredAt
      cur.listingSlug = a.listingSlug
      if (subtestKey) cur.subtest = subtestKey
    }

    grouped.set(groupKey, cur)
  }

  return Array.from(grouped.values())
    .filter(v => v.missCount > 0)
    .map(v => ({ ...v, missRate: Math.round((v.missCount / v.attemptCount) * 100) }))
    .sort((a, b) => b.wrongCount - a.wrongCount || b.missRate - a.missRate || b.skipCount - a.skipCount)
}

export interface MissedTopicDestination {
  type: 'topic'
  topicId: string
  listingSlug: string
}

export interface ResolvedMissedTopic extends MissedTopicRaw {
  label: string
  /** Present only when a real, still-existing navigation target was resolved. */
  destination: MissedTopicDestination | null
}

/**
 * resolveMissedTopicLabels — turns raw groups into display-ready rows: a
 * human label, and (when possible) a tap-through destination.
 *
 * Label resolution:
 *   - sourceTable 'flashcards': rawTopic IS a topics.id — look it up in
 *     `topicNameMap`. If the topic was since deleted (row's question no
 *     longer resolves — the "question no longer exists" edge case), fall
 *     back to the subtest, then a generic label. Never throws, never drops
 *     the row.
 *   - otherwise (upcat_questions): rawTopic is already a free-text label —
 *     use it directly, falling back to subtest.
 *
 * Destination resolution: only flashcards topics that still resolve in
 * `topicNameMap` get a destination (the existing /practice/[topicId] review
 * screen). upcat_questions-sourced mistakes have no equivalent single-topic
 * review screen today, so they're shown but not tappable — "a sensible
 * destination" doesn't exist for them yet.
 */
export function resolveMissedTopicLabels(
  raw: MissedTopicRaw[],
  topicNameMap: Map<string, string>,
): ResolvedMissedTopic[] {
  return raw.map(v => {
    if (v.sourceTable === 'flashcards' && v.rawTopic) {
      const name = topicNameMap.get(v.rawTopic)
      if (name) {
        return { ...v, label: name, destination: { type: 'topic', topicId: v.rawTopic, listingSlug: v.listingSlug } }
      }
      // Topic id no longer resolves (deleted/renamed) — degrade gracefully.
      return { ...v, label: v.subtest ?? 'Flashcards', destination: null }
    }
    const label = v.rawTopic ?? v.subtest ?? 'General'
    return { ...v, label, destination: null }
  })
}

// ── Accuracy trend (longer window than the 7-day "This Week" chart) ─────────

export interface TrendPoint {
  weekStart: number
  accuracy: number | null
  sessionCount: number
}

/**
 * computeAccuracyTrend — weekly-bucketed accuracy over the last `weeks`
 * 7-day windows (default 8 ≈ 56 days), most recent window last. Each bucket
 * is [weekStart, weekStart + 7d) in local calendar days, anchored so the
 * most recent bucket always ends at "today + 1 day" (i.e. includes today).
 *
 * Deliberately a *separate* function from computeWeeklyData (kept as-is —
 * it backs the existing "This Week" daily chart and has its own tests) so
 * this longer trend doesn't change that function's 7-bars-always contract.
 */
export function computeAccuracyTrend(
  sessions: { completedAt: number; score: number; total: number }[],
  weeks = 8,
): TrendPoint[] {
  const dayMs = 86_400_000
  const weekMs = dayMs * 7
  const now = new Date()
  const todayStartExclusive = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() + dayMs

  const points: TrendPoint[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const endExclusive = todayStartExclusive - i * weekMs
    const start = endExclusive - weekMs
    const bucket = sessions.filter(s => s.completedAt >= start && s.completedAt < endExclusive && s.total > 0)
    const accuracy = bucket.length > 0
      ? Math.round(bucket.reduce((sum, s) => sum + (s.score / s.total) * 100, 0) / bucket.length)
      : null
    points.push({ weekStart: start, accuracy, sessionCount: bucket.length })
  }
  return points
}

// ── Percentile band history (no new table — derived from practice_sessions) ─

export interface MockAttemptPercentile {
  listingSlug: string
  completedAt: number
  pct: number
  percentile: number
  band: string
  blurb: string
}

/**
 * computeMockAttemptHistory — one entry per full mock-exam ATTEMPT (not per
 * section row), each scored through estimatePercentileBand. Mirrors
 * homeAggregates.ts's getListingMockBest attempt-key trick (SQL there; plain
 * JS here since useAnalytics.ts already has the full sessions array in
 * memory) — a mock attempt writes one practice_sessions row per section, all
 * sharing one start time, reconstructable as
 *   completedAt - durationSecs*1000, bucketed to the second.
 *
 * Returns attempts sorted oldest-first (chronological, for a history/trend
 * view). A user with no mock attempts gets an empty array.
 */
export function computeMockAttemptHistory(
  sessions: Array<{
    listingSlug: string
    topicId: string
    subtest: string | null
    score: number
    total: number
    completedAt: number
    durationSecs: number
  }>,
): MockAttemptPercentile[] {
  const mockRows = sessions.filter(s => s.topicId === '' && s.subtest && s.total > 0)

  const grouped = new Map<string, { listingSlug: string; completedAt: number; score: number; total: number }>()
  for (const s of mockRows) {
    const attemptKey = Math.floor((s.completedAt - s.durationSecs * 1000) / 1000)
    const key = `${s.listingSlug}:${attemptKey}`
    const cur = grouped.get(key) ?? { listingSlug: s.listingSlug, completedAt: s.completedAt, score: 0, total: 0 }
    cur.score += s.score
    cur.total += s.total
    cur.completedAt = Math.max(cur.completedAt, s.completedAt)
    grouped.set(key, cur)
  }

  return Array.from(grouped.values())
    .map(v => {
      const pct = Math.round((v.score / v.total) * 100)
      const band: PercentileBand = estimatePercentileBand(pct)
      return { listingSlug: v.listingSlug, completedAt: v.completedAt, pct, ...band }
    })
    .sort((a, b) => a.completedAt - b.completedAt)
}
