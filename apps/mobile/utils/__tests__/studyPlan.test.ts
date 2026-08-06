import {
  generateStudyPlan, pacingBand, daysUntil, isWeeklyMockDay, formatPlanDate,
  itemMatchesSession, itemMatchesSrsReview, describeTopPlanItem,
  PACING_BAND_CONFIG,
  type WeakTopicInput, type GenerateStudyPlanInput,
} from '../studyPlan'

const DAY_MS = 86_400_000

// A fixed Wednesday, so "far"/"near" exam-date fixtures below land predictably
// and isWeeklyMockDay() is false by default (tests that need Sunday say so).
const WEDNESDAY = new Date('2026-08-05T08:00:00') // 2026-08-05 is a Wednesday
const SUNDAY = new Date('2026-08-09T08:00:00')     // 2026-08-09 is a Sunday

const weakTopic = (topicId: string, accuracy: number): WeakTopicInput => ({
  topicId, topicName: topicId, accuracy,
})

function baseInput(overrides: Partial<GenerateStudyPlanInput> = {}): GenerateStudyPlanInput {
  return {
    today: WEDNESDAY,
    earliestExamDate: null,
    dueSrsCount: 0,
    weakTopics: [],
    hasAnyReadinessData: true,
    mockSectionRefId: null,
    ...overrides,
  }
}

describe('pacingBand', () => {
  it('no exam date at all paces light', () => {
    expect(pacingBand(null)).toBe('light')
  })
  it('> 60 days out paces light', () => {
    expect(pacingBand(61)).toBe('light')
  })
  it('21-60 days out paces moderate', () => {
    expect(pacingBand(60)).toBe('moderate')
    expect(pacingBand(21)).toBe('moderate')
  })
  it('< 21 days out paces heavy', () => {
    expect(pacingBand(20)).toBe('heavy')
    expect(pacingBand(0)).toBe('heavy')
  })
})

describe('daysUntil', () => {
  it('ceils partial days (3.2 days left reads as 4)', () => {
    const today = new Date('2026-08-05T08:00:00')
    const exam = today.getTime() + 3.2 * DAY_MS
    expect(daysUntil(today, exam)).toBe(4)
  })
})

describe('isWeeklyMockDay', () => {
  it('true on Sunday, false otherwise', () => {
    expect(isWeeklyMockDay(SUNDAY)).toBe(true)
    expect(isWeeklyMockDay(WEDNESDAY)).toBe(false)
  })
})

describe('formatPlanDate', () => {
  it('formats as YYYY-MM-DD using local calendar fields', () => {
    expect(formatPlanDate(new Date(2026, 0, 5))).toBe('2026-01-05') // Jan (0-indexed month)
    expect(formatPlanDate(new Date(2026, 10, 30))).toBe('2026-11-30')
  })
})

// ── generateStudyPlan matrix: far exam / near exam / no data / all caught up ──

describe('generateStudyPlan — no data (brand-new user)', () => {
  it('returns a single diagnostic item when nothing is due, nothing is weak, and there is no practice history at all', () => {
    const items = generateStudyPlan(baseInput({ hasAnyReadinessData: false }))
    expect(items).toEqual([{ kind: 'diagnostic', refId: '', targetCount: 1 }])
  })

  it('a focused exam date does not change the no-data branch', () => {
    const items = generateStudyPlan(baseInput({
      hasAnyReadinessData: false,
      earliestExamDate: WEDNESDAY.getTime() + 5 * DAY_MS,
    }))
    expect(items).toEqual([{ kind: 'diagnostic', refId: '', targetCount: 1 }])
  })
})

describe('generateStudyPlan — all caught up', () => {
  it('returns an empty plan when nothing is due, nothing is weak, but the user HAS practice history', () => {
    const items = generateStudyPlan(baseInput({ hasAnyReadinessData: true }))
    expect(items).toEqual([])
  })
})

describe('generateStudyPlan — far exam (light pacing)', () => {
  it('due SRS reviews first, then one weak-topic item, capped at the light band size', () => {
    const items = generateStudyPlan(baseInput({
      earliestExamDate: WEDNESDAY.getTime() + 90 * DAY_MS, // > 60 days
      dueSrsCount: 40,
      weakTopics: [weakTopic('algebra', 30), weakTopic('geometry', 45)],
    }))
    expect(items).toEqual([
      { kind: 'srs_review', refId: '', targetCount: PACING_BAND_CONFIG.light.srsCap },
      { kind: 'topic_practice', refId: 'algebra', targetCount: PACING_BAND_CONFIG.light.topicTarget },
    ])
  })

  it('no focused exam at all also paces light', () => {
    const items = generateStudyPlan(baseInput({
      earliestExamDate: null,
      dueSrsCount: 5,
      weakTopics: [weakTopic('algebra', 30)],
    }))
    expect(items).toEqual([
      { kind: 'srs_review', refId: '', targetCount: 5 },
      { kind: 'topic_practice', refId: 'algebra', targetCount: PACING_BAND_CONFIG.light.topicTarget },
    ])
  })
})

describe('generateStudyPlan — near exam (heavy pacing)', () => {
  it('due SRS + two weak topics, no mock on a non-Sunday day', () => {
    const items = generateStudyPlan(baseInput({
      today: WEDNESDAY,
      earliestExamDate: WEDNESDAY.getTime() + 10 * DAY_MS, // < 21 days
      dueSrsCount: 40,
      weakTopics: [weakTopic('algebra', 30), weakTopic('geometry', 45), weakTopic('physics', 50)],
      mockSectionRefId: 'upcat',
    }))
    expect(items).toEqual([
      { kind: 'srs_review', refId: '', targetCount: PACING_BAND_CONFIG.heavy.srsCap },
      { kind: 'topic_practice', refId: 'algebra', targetCount: PACING_BAND_CONFIG.heavy.topicTarget },
      { kind: 'topic_practice', refId: 'geometry', targetCount: PACING_BAND_CONFIG.heavy.topicTarget },
    ])
  })

  it('adds a weekly mock_section on Sunday, capped at 4 total items', () => {
    const items = generateStudyPlan(baseInput({
      today: SUNDAY,
      earliestExamDate: SUNDAY.getTime() + 5 * DAY_MS,
      dueSrsCount: 40,
      weakTopics: [weakTopic('algebra', 30), weakTopic('geometry', 45)],
      mockSectionRefId: 'upcat',
    }))
    expect(items).toHaveLength(4)
    expect(items[3]).toEqual({ kind: 'mock_section', refId: 'upcat', targetCount: 1 })
  })

  it('no mock_section when there is no focused-exam slug to attach it to', () => {
    const items = generateStudyPlan(baseInput({
      today: SUNDAY,
      earliestExamDate: SUNDAY.getTime() + 5 * DAY_MS,
      dueSrsCount: 10,
      weakTopics: [weakTopic('algebra', 30)],
      mockSectionRefId: null,
    }))
    expect(items.some(i => i.kind === 'mock_section')).toBe(false)
  })
})

describe('generateStudyPlan — single-signal edge cases', () => {
  it('only due SRS reviews (no weak topics) yields a 1-item plan, not padded artificially', () => {
    const items = generateStudyPlan(baseInput({ dueSrsCount: 8, weakTopics: [] }))
    expect(items).toEqual([{ kind: 'srs_review', refId: '', targetCount: 8 }])
  })

  it('only weak topics (nothing due) yields a 1-item plan', () => {
    const items = generateStudyPlan(baseInput({ dueSrsCount: 0, weakTopics: [weakTopic('algebra', 40)] }))
    expect(items).toEqual([{ kind: 'topic_practice', refId: 'algebra', targetCount: PACING_BAND_CONFIG.light.topicTarget }])
  })
})

// ── Completion matching ───────────────────────────────────────────────────────

describe('itemMatchesSession', () => {
  it('topic_practice matches a session with the same topicId', () => {
    expect(itemMatchesSession({ kind: 'topic_practice', refId: 'algebra' }, { topicId: 'algebra', listingSlug: '', subtest: null })).toBe(true)
    expect(itemMatchesSession({ kind: 'topic_practice', refId: 'algebra' }, { topicId: 'geometry', listingSlug: '', subtest: null })).toBe(false)
    expect(itemMatchesSession({ kind: 'topic_practice', refId: 'algebra' }, { topicId: '', listingSlug: '', subtest: null })).toBe(false)
  })

  it('mock_section matches a session on the same listing with a subtest set', () => {
    expect(itemMatchesSession({ kind: 'mock_section', refId: 'upcat' }, { topicId: '', listingSlug: 'upcat', subtest: 'Mathematics' })).toBe(true)
    expect(itemMatchesSession({ kind: 'mock_section', refId: 'upcat' }, { topicId: '', listingSlug: 'upcat', subtest: null })).toBe(false)
    expect(itemMatchesSession({ kind: 'mock_section', refId: 'upcat' }, { topicId: '', listingSlug: 'acet', subtest: 'Mathematics' })).toBe(false)
  })

  it('diagnostic matches ANY completed session', () => {
    expect(itemMatchesSession({ kind: 'diagnostic', refId: '' }, { topicId: 'anything', listingSlug: 'anything', subtest: null })).toBe(true)
    expect(itemMatchesSession({ kind: 'diagnostic', refId: '' }, { topicId: '', listingSlug: '', subtest: null })).toBe(true)
  })

  it('srs_review never matches a session (matched separately via itemMatchesSrsReview)', () => {
    expect(itemMatchesSession({ kind: 'srs_review', refId: '' }, { topicId: '', listingSlug: '', subtest: null })).toBe(false)
  })
})

describe('itemMatchesSrsReview', () => {
  it('matches an srs_review item when at least one review was recorded', () => {
    expect(itemMatchesSrsReview({ kind: 'srs_review', refId: '' }, 1)).toBe(true)
    expect(itemMatchesSrsReview({ kind: 'srs_review', refId: '' }, 0)).toBe(false)
  })
  it('never matches a non-srs_review item', () => {
    expect(itemMatchesSrsReview({ kind: 'topic_practice', refId: 'algebra' }, 5)).toBe(false)
  })
})

describe('describeTopPlanItem', () => {
  it('falls back to a generic phrase when there is no top item', () => {
    expect(describeTopPlanItem(null)).toMatch(/streak/i)
  })
  it('describes each kind', () => {
    expect(describeTopPlanItem({ kind: 'srs_review', refId: '', targetCount: 1 })).toContain('1 due flashcard')
    expect(describeTopPlanItem({ kind: 'srs_review', refId: '', targetCount: 5 })).toContain('5 due flashcards')
    expect(describeTopPlanItem({ kind: 'topic_practice', refId: 't1', targetCount: 8 }, 'Algebra')).toContain('Algebra')
    expect(describeTopPlanItem({ kind: 'mock_section', refId: 'upcat', targetCount: 1 })).toMatch(/mock/i)
    expect(describeTopPlanItem({ kind: 'diagnostic', refId: '', targetCount: 1 })).toMatch(/diagnostic/i)
  })
})
