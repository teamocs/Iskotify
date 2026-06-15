import { topicReadiness, subjectReadinessPct } from '../subjectReadiness'

// ── topicReadiness ────────────────────────────────────────────────────────────
// readiness for ONE topic = max(topic's own review best, subject-level mock best).
// A mock covering the subject lifts every topic in it; an individual topic review
// can exceed it. null only when BOTH are absent.

describe('topicReadiness', () => {
  it('returns the topic review best when there is no subject mock', () => {
    expect(topicReadiness({ topicBest: 80, subjectBest: null })).toBe(80)
  })

  it('returns the subject mock best when the topic has no review (mock lifts the topic)', () => {
    expect(topicReadiness({ topicBest: null, subjectBest: 65 })).toBe(65)
  })

  it('returns the MAX when both exist and the review beats the mock', () => {
    expect(topicReadiness({ topicBest: 90, subjectBest: 50 })).toBe(90)
  })

  it('returns the MAX when both exist and the mock beats the review', () => {
    expect(topicReadiness({ topicBest: 40, subjectBest: 70 })).toBe(70)
  })

  it('returns the shared value when both are equal', () => {
    expect(topicReadiness({ topicBest: 55, subjectBest: 55 })).toBe(55)
  })

  it('returns null when BOTH are absent', () => {
    expect(topicReadiness({ topicBest: null, subjectBest: null })).toBeNull()
  })

  it('treats a 0 topicBest as a real value (not absent)', () => {
    expect(topicReadiness({ topicBest: 0, subjectBest: null })).toBe(0)
  })

  it('treats a 0 subjectBest as a real value (not absent)', () => {
    expect(topicReadiness({ topicBest: null, subjectBest: 0 })).toBe(0)
  })
})

// ── subjectReadinessPct ───────────────────────────────────────────────────────
// average of topicReadiness over the subject's topics (skipping nulls); if no
// topic has readiness, fall back to the subject-level mock best; null if nothing.

const SUBJECT = 'Reading Comprehension'

describe('subjectReadinessPct', () => {
  it('averages the per-topic readiness across the subject topics', () => {
    const topics = [{ id: 't1' }, { id: 't2' }]
    const perTopic = new Map<string, number>([['t1', 80], ['t2', 40]])
    const subjectBest = new Map<string, number>()
    // (80 + 40) / 2 = 60
    expect(subjectReadinessPct(topics, perTopic, SUBJECT, subjectBest)).toBe(60)
  })

  it('rounds the average', () => {
    const topics = [{ id: 't1' }, { id: 't2' }]
    const perTopic = new Map<string, number>([['t1', 80], ['t2', 41]])
    const subjectBest = new Map<string, number>()
    // (80 + 41) / 2 = 60.5 → 61
    expect(subjectReadinessPct(topics, perTopic, SUBJECT, subjectBest)).toBe(61)
  })

  it('a subject-level mock lifts EVERY topic, so the average reflects the mock', () => {
    // No per-topic review rows at all; the subject was practiced ONLY via mock.
    const topics = [{ id: 't1' }, { id: 't2' }, { id: 't3' }]
    const perTopic = new Map<string, number>()
    const subjectBest = new Map<string, number>([[SUBJECT, 55]])
    // each topic's readiness = mock best 55 → average 55
    expect(subjectReadinessPct(topics, perTopic, SUBJECT, subjectBest)).toBe(55)
  })

  it('a per-topic review above the mock raises that topic; averaging blends them', () => {
    const topics = [{ id: 't1' }, { id: 't2' }]
    const perTopic = new Map<string, number>([['t1', 90]]) // t1 review beats mock
    const subjectBest = new Map<string, number>([[SUBJECT, 50]])
    // t1 = max(90, 50) = 90 ; t2 = max(null, 50) = 50 → (90 + 50)/2 = 70
    expect(subjectReadinessPct(topics, perTopic, SUBJECT, subjectBest)).toBe(70)
  })

  it('falls back to the subject mock best when the subject has NO topics', () => {
    const topics: Array<{ id: string }> = []
    const perTopic = new Map<string, number>()
    const subjectBest = new Map<string, number>([[SUBJECT, 42]])
    expect(subjectReadinessPct(topics, perTopic, SUBJECT, subjectBest)).toBe(42)
  })

  it('returns null when there are no topics and no subject mock', () => {
    const topics: Array<{ id: string }> = []
    const perTopic = new Map<string, number>()
    const subjectBest = new Map<string, number>()
    expect(subjectReadinessPct(topics, perTopic, SUBJECT, subjectBest)).toBeNull()
  })

  it('returns null when topics exist but none have any readiness and there is no mock', () => {
    const topics = [{ id: 't1' }, { id: 't2' }]
    const perTopic = new Map<string, number>()
    const subjectBest = new Map<string, number>()
    expect(subjectReadinessPct(topics, perTopic, SUBJECT, subjectBest)).toBeNull()
  })

  it('clamps the result to 0–100', () => {
    const topics = [{ id: 't1' }]
    const perTopic = new Map<string, number>([['t1', 150]]) // out-of-range guard
    const subjectBest = new Map<string, number>()
    expect(subjectReadinessPct(topics, perTopic, SUBJECT, subjectBest)).toBe(100)
  })
})
