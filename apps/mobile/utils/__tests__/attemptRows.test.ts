import { buildAttemptRows } from '../attemptRows'

describe('buildAttemptRows', () => {
  const baseQuestions = [
    { questionId: 'q1', correctIndex: 1, subtest: 'Mathematics', topic: 'Algebra' },
    { questionId: 'q2', correctIndex: 0, subtest: 'Science', topic: null },
    { questionId: 'q3', correctIndex: 2 }, // no subtest/topic supplied at all
  ]

  it('builds one row per question, in order', () => {
    const rows = buildAttemptRows({
      sessionKey: 123,
      sourceTable: 'upcat_questions',
      listingSlug: 'upcat',
      questions: baseQuestions,
      answers: { 0: 1, 1: 1, 2: 2 },
      elapsedByIdx: { 0: 1000, 1: 2000, 2: 3000 },
      answeredAt: 999,
    })
    expect(rows).toHaveLength(3)
    expect(rows.map(r => r.questionId)).toEqual(['q1', 'q2', 'q3'])
  })

  it('marks correct when the selected index matches correctIndex', () => {
    const [row] = buildAttemptRows({
      sessionKey: 1,
      sourceTable: 'upcat_questions',
      listingSlug: '',
      questions: [baseQuestions[0]!],
      answers: { 0: 1 },
      elapsedByIdx: {},
      answeredAt: 1,
    })
    expect(row!.correct).toBe(true)
    expect(row!.selectedIndex).toBe(1)
  })

  it('marks incorrect (not thrown) when the selected index is wrong', () => {
    const [row] = buildAttemptRows({
      sessionKey: 1,
      sourceTable: 'upcat_questions',
      listingSlug: '',
      questions: [baseQuestions[0]!],
      answers: { 0: 3 },
      elapsedByIdx: {},
      answeredAt: 1,
    })
    expect(row!.correct).toBe(false)
    expect(row!.selectedIndex).toBe(3)
  })

  it('writes a row for a skipped question — selectedIndex null, correct false', () => {
    const [row] = buildAttemptRows({
      sessionKey: 1,
      sourceTable: 'flashcards',
      listingSlug: '',
      questions: [baseQuestions[0]!],
      answers: {}, // nothing answered
      elapsedByIdx: {},
      answeredAt: 1,
    })
    expect(row!.selectedIndex).toBeNull()
    expect(row!.correct).toBe(false)
  })

  it('defaults subtest/topic to null when the caller omits them', () => {
    const [row] = buildAttemptRows({
      sessionKey: 1,
      sourceTable: 'upcat_questions',
      listingSlug: '',
      questions: [baseQuestions[2]!], // no subtest/topic
      answers: {},
      elapsedByIdx: {},
      answeredAt: 1,
    })
    expect(row!.subtest).toBeNull()
    expect(row!.topic).toBeNull()
  })

  it('pulls elapsedMs from the matching flat index, defaulting to 0 when absent', () => {
    const rows = buildAttemptRows({
      sessionKey: 1,
      sourceTable: 'upcat_questions',
      listingSlug: '',
      questions: baseQuestions,
      answers: {},
      elapsedByIdx: { 0: 4200 }, // only index 0 has a timing entry
      answeredAt: 1,
    })
    expect(rows[0]!.elapsedMs).toBe(4200)
    expect(rows[1]!.elapsedMs).toBe(0)
    expect(rows[2]!.elapsedMs).toBe(0)
  })

  it('threads sessionKey, sourceTable, listingSlug and answeredAt through unchanged', () => {
    const rows = buildAttemptRows({
      sessionKey: 555,
      sourceTable: 'flashcards',
      listingSlug: 'my-listing',
      questions: [baseQuestions[0]!],
      answers: {},
      elapsedByIdx: {},
      answeredAt: 777,
    })
    expect(rows[0]).toMatchObject({
      sessionKey: 555,
      sourceTable: 'flashcards',
      listingSlug: 'my-listing',
      answeredAt: 777,
    })
  })

  it('defaults answeredAt to Date.now() when omitted', () => {
    const before = Date.now()
    const rows = buildAttemptRows({
      sessionKey: 1,
      sourceTable: 'upcat_questions',
      listingSlug: '',
      questions: [baseQuestions[0]!],
      answers: {},
      elapsedByIdx: {},
    })
    const after = Date.now()
    expect(rows[0]!.answeredAt).toBeGreaterThanOrEqual(before)
    expect(rows[0]!.answeredAt).toBeLessThanOrEqual(after)
  })

  it('returns an empty array for an empty question list', () => {
    expect(buildAttemptRows({
      sessionKey: 1, sourceTable: 'upcat_questions', listingSlug: '',
      questions: [], answers: {}, elapsedByIdx: {},
    })).toEqual([])
  })
})
