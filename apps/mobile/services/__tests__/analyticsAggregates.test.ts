/**
 * Task G — unit tests for services/analyticsAggregates.ts's pure aggregate
 * functions. Per the task brief, coverage must include: empty data (new
 * user), partial topic coverage (some attempt rows have topic, some only
 * subtest, some neither), and rows whose question/topic no longer exists
 * (a flashcard topic id that doesn't resolve in the topics lookup).
 */

import {
  computeAvgTimePerQuestion,
  computeMostMissedTopics,
  resolveMissedTopicLabels,
  computeAccuracyTrend,
  computeMockAttemptHistory,
  type AttemptRecord,
} from '../analyticsAggregates'

function attempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    sourceTable: 'upcat_questions',
    questionId: 'q1',
    listingSlug: 'upcat',
    subtest: 'Mathematics',
    topic: 'Algebra',
    // Non-null by default so `correct: false` overrides (used throughout this
    // file before skip-tracking existed) still read as genuine wrong answers,
    // not skips — matches buildAttemptRows' convention (utils/attemptRows.ts).
    selectedIndex: 0,
    correct: true,
    elapsedMs: 30_000,
    answeredAt: 1_700_000_000_000,
    ...overrides,
  }
}

// ── computeAvgTimePerQuestion ────────────────────────────────────────────────

describe('computeAvgTimePerQuestion', () => {
  it('empty data → null overall, no subjects, zero count', () => {
    const result = computeAvgTimePerQuestion([])
    expect(result.overallAvgMs).toBeNull()
    expect(result.overallCount).toBe(0)
    expect(result.bySubject).toEqual([])
  })

  it('averages elapsedMs overall and per subtest, excluding untimed (elapsedMs<=0) rows', () => {
    const attempts = [
      attempt({ subtest: 'Mathematics', elapsedMs: 20_000 }),
      attempt({ subtest: 'Mathematics', elapsedMs: 40_000 }),
      attempt({ subtest: 'Science', elapsedMs: 10_000 }),
      attempt({ subtest: 'Science', elapsedMs: 0 }), // untimed — excluded everywhere
    ]
    const result = computeAvgTimePerQuestion(attempts)
    expect(result.overallAvgMs).toBe(Math.round((20_000 + 40_000 + 10_000) / 3))
    expect(result.overallCount).toBe(3)
    const math = result.bySubject.find(s => s.subject === 'Mathematics')
    const science = result.bySubject.find(s => s.subject === 'Science')
    expect(math).toEqual({ subject: 'Mathematics', avgMs: 30_000, count: 2 })
    expect(science).toEqual({ subject: 'Science', avgMs: 10_000, count: 1 })
  })

  it('rows with no subtest still count toward the overall average but not any subject bucket', () => {
    const attempts = [
      attempt({ subtest: null, elapsedMs: 15_000 }),
      attempt({ subtest: '', elapsedMs: 25_000 }),
    ]
    const result = computeAvgTimePerQuestion(attempts)
    expect(result.overallCount).toBe(2)
    expect(result.bySubject).toEqual([])
  })
})

// ── computeMostMissedTopics / resolveMissedTopicLabels ──────────────────────

describe('computeMostMissedTopics', () => {
  it('empty data → empty array', () => {
    expect(computeMostMissedTopics([])).toEqual([])
  })

  it('groups by topic, falls back to subtest when topic is absent, and skips rows with neither (partial topic coverage)', () => {
    const attempts = [
      // Blueprint mock: full topic coverage
      attempt({ sourceTable: 'upcat_questions', topic: 'Algebra', subtest: 'Mathematics', correct: false }),
      attempt({ sourceTable: 'upcat_questions', topic: 'Algebra', subtest: 'Mathematics', correct: true }),
      // Diagnostic engine: topic always null — falls back to subtest
      attempt({ sourceTable: 'upcat_questions', topic: null, subtest: 'Science', correct: false }),
      // A row with neither topic nor subtest — cannot be attributed, must be skipped
      attempt({ sourceTable: 'upcat_questions', topic: null, subtest: null, correct: false }),
    ]
    const groups = computeMostMissedTopics(attempts)
    // Only 2 attributable groups: Algebra (1 miss/2 attempts) and Science (1 miss/1 attempt)
    expect(groups).toHaveLength(2)
    const algebra = groups.find(g => g.rawTopic === 'Algebra')
    const science = groups.find(g => g.subtest === 'Science' && g.rawTopic === null)
    expect(algebra?.missCount).toBe(1)
    expect(algebra?.attemptCount).toBe(2)
    expect(algebra?.missRate).toBe(50)
    expect(science?.missCount).toBe(1)
    expect(science?.attemptCount).toBe(1)
    expect(science?.missRate).toBe(100)
  })

  it('excludes groups with zero misses entirely (a topic the student always gets right is not a "mistake")', () => {
    const attempts = [attempt({ topic: 'Geometry', correct: true })]
    expect(computeMostMissedTopics(attempts)).toEqual([])
  })

  it('sorts by miss count desc, then miss rate desc', () => {
    const attempts = [
      attempt({ topic: 'A', correct: false }),
      attempt({ topic: 'A', correct: false }),
      attempt({ topic: 'B', correct: false }),
      attempt({ topic: 'B', correct: false }),
      attempt({ topic: 'B', correct: false }),
    ]
    const groups = computeMostMissedTopics(attempts)
    expect(groups.map(g => g.rawTopic)).toEqual(['B', 'A'])
  })

  // Finding 1: a skipped question (selectedIndex: null, correct: false — the
  // buildAttemptRows convention for "ran out of time / never answered") is
  // NOT a genuine mistake and must not inflate — or outrank — real wrong
  // answers in this ranking.
  it('reports wrong answers and skips separately, and never lets a skip-only topic outrank a topic with a genuine wrong answer', () => {
    const attempts = [
      // Topic "Skipped Only": 3 questions abandoned under time pressure — zero conceptual errors.
      attempt({ topic: 'Skipped Only', correct: false, selectedIndex: null }),
      attempt({ topic: 'Skipped Only', correct: false, selectedIndex: null }),
      attempt({ topic: 'Skipped Only', correct: false, selectedIndex: null }),
      // Topic "Genuine Mistake": just 1 question, but actually answered wrong.
      attempt({ topic: 'Genuine Mistake', correct: false, selectedIndex: 2 }),
    ]
    const groups = computeMostMissedTopics(attempts)

    const skipOnly = groups.find(g => g.rawTopic === 'Skipped Only')!
    const genuine = groups.find(g => g.rawTopic === 'Genuine Mistake')!

    // Counts reported separately per topic.
    expect(skipOnly.wrongCount).toBe(0)
    expect(skipOnly.skipCount).toBe(3)
    expect(genuine.wrongCount).toBe(1)
    expect(genuine.skipCount).toBe(0)

    // Ranked by WRONG answers — despite 3 misses vs 1, the skip-only topic
    // must not outrank the topic with a real wrong answer.
    expect(groups.map(g => g.rawTopic)).toEqual(['Genuine Mistake', 'Skipped Only'])
  })

  it('a mixed topic (some wrong, some skipped) tracks both counts independently', () => {
    const attempts = [
      attempt({ topic: 'Mixed', correct: false, selectedIndex: 1 }),
      attempt({ topic: 'Mixed', correct: false, selectedIndex: null }),
      attempt({ topic: 'Mixed', correct: false, selectedIndex: null }),
      attempt({ topic: 'Mixed', correct: true }),
    ]
    const groups = computeMostMissedTopics(attempts)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.wrongCount).toBe(1)
    expect(groups[0]!.skipCount).toBe(2)
    expect(groups[0]!.attemptCount).toBe(4)
  })
})

describe('resolveMissedTopicLabels', () => {
  it('flashcards topic resolves to its name + a tap-through destination when the topic still exists', () => {
    const raw = computeMostMissedTopics([
      attempt({ sourceTable: 'flashcards', topic: 'topic-123', subtest: null, listingSlug: 'upcat', correct: false }),
    ])
    const topicNameMap = new Map([['topic-123', 'Cell Biology']])
    const resolved = resolveMissedTopicLabels(raw, topicNameMap)
    expect(resolved).toHaveLength(1)
    expect(resolved[0]!.label).toBe('Cell Biology')
    expect(resolved[0]!.destination).toEqual({ type: 'topic', topicId: 'topic-123', listingSlug: 'upcat' })
  })

  it('flashcards topic whose question/topic no longer exists degrades gracefully — no crash, no dropped row, no destination', () => {
    const raw = computeMostMissedTopics([
      attempt({ sourceTable: 'flashcards', topic: 'deleted-topic-id', subtest: 'Biology', correct: false }),
    ])
    const topicNameMap = new Map<string, string>() // empty — the topic was deleted
    const resolved = resolveMissedTopicLabels(raw, topicNameMap)
    expect(resolved).toHaveLength(1)
    expect(resolved[0]!.label).toBe('Biology') // falls back to subtest
    expect(resolved[0]!.destination).toBeNull()
  })

  it('upcat_questions rows use the raw topic label directly and never get a destination', () => {
    const raw = computeMostMissedTopics([
      attempt({ sourceTable: 'upcat_questions', topic: 'Algebra', correct: false }),
    ])
    const resolved = resolveMissedTopicLabels(raw, new Map())
    expect(resolved[0]!.label).toBe('Algebra')
    expect(resolved[0]!.destination).toBeNull()
  })
})

// ── computeAccuracyTrend ──────────────────────────────────────────────────────

describe('computeAccuracyTrend', () => {
  it('empty data → `weeks` points, all null accuracy, zero sessions', () => {
    const points = computeAccuracyTrend([], 8)
    expect(points).toHaveLength(8)
    expect(points.every(p => p.accuracy === null && p.sessionCount === 0)).toBe(true)
  })

  it('buckets sessions into the correct week and computes mean accuracy for that week', () => {
    const now = Date.now()
    const weekMs = 7 * 86_400_000
    const sessions = [
      { completedAt: now, score: 8, total: 10 }, // this week: 80%
      { completedAt: now - weekMs, score: 5, total: 10 }, // last week: 50%
    ]
    const points = computeAccuracyTrend(sessions, 8)
    const lastPoint = points[points.length - 1]!
    const secondLastPoint = points[points.length - 2]!
    expect(lastPoint.accuracy).toBe(80)
    expect(lastPoint.sessionCount).toBe(1)
    expect(secondLastPoint.accuracy).toBe(50)
  })

  it('ignores sessions with total=0 (division-by-zero guard)', () => {
    const points = computeAccuracyTrend([{ completedAt: Date.now(), score: 0, total: 0 }], 8)
    expect(points[points.length - 1]!.accuracy).toBeNull()
  })
})

// ── computeMockAttemptHistory ─────────────────────────────────────────────────

describe('computeMockAttemptHistory', () => {
  it('empty data → empty array (new user, no full mock attempts)', () => {
    expect(computeMockAttemptHistory([])).toEqual([])
  })

  it('groups multi-section mock rows into one attempt per start time and applies estimatePercentileBand', () => {
    const startTime = 1_700_000_000_000
    const durationSecs = 3600
    const completedAt = startTime + durationSecs * 1000
    const sessions = [
      { listingSlug: 'upcat', topicId: '', subtest: 'Mathematics', score: 18, total: 20, completedAt, durationSecs },
      { listingSlug: 'upcat', topicId: '', subtest: 'Science', score: 16, total: 20, completedAt, durationSecs },
    ]
    const history = computeMockAttemptHistory(sessions)
    expect(history).toHaveLength(1)
    expect(history[0]!.pct).toBe(Math.round(((18 + 16) / 40) * 100)) // 85%
    expect(history[0]!.percentile).toBe(85)
    expect(history[0]!.band).toBe('Competitive')
  })

  it('excludes topic-review sessions (topicId non-empty) — only full mock sentinel rows count', () => {
    const sessions = [
      { listingSlug: 'upcat', topicId: 'topic-1', subtest: null, score: 5, total: 5, completedAt: Date.now(), durationSecs: 60 },
    ]
    expect(computeMockAttemptHistory(sessions)).toEqual([])
  })

  it('sorts attempts chronologically, oldest first', () => {
    const sessions = [
      { listingSlug: 'upcat', topicId: '', subtest: 'Mathematics', score: 5, total: 10, completedAt: 2_000, durationSecs: 60 },
      { listingSlug: 'upcat', topicId: '', subtest: 'Mathematics', score: 5, total: 10, completedAt: 1_000, durationSecs: 60 },
    ]
    const history = computeMockAttemptHistory(sessions)
    expect(history.map(h => h.completedAt)).toEqual([1_000, 2_000])
  })
})
