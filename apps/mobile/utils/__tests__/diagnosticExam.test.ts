import {
  DIAGNOSTIC_SUBTESTS,
  QUESTIONS_PER_SUBTEST,
  SECONDS_PER_QUESTION,
  resolveDiagnosticSubtests,
  buildDiagnosticQuestions,
  scoreDiagnostic,
  buildDiagnosticSessionParams,
  weakestSubject,
  isBundledDiagnosticId,
} from '../diagnosticExam'
import type { UpcatLocalRow } from '../preAssessmentSource'
import { PRE_ASSESS_QUESTIONS } from '../../data/preAssessment'

function row(p: Partial<UpcatLocalRow>): UpcatLocalRow {
  return {
    questionId: 'M001', subtest: 'Mathematics', questionText: 'Q?',
    options: JSON.stringify(['a', 'b', 'c', 'd']), correctIndex: 2,
    explanation: 'x', setId: null, ...p,
  }
}

describe('constants', () => {
  it('covers the 4 official UPCAT subtests', () => {
    expect(DIAGNOSTIC_SUBTESTS).toEqual(['Mathematics', 'Science', 'Language Proficiency', 'Reading Comprehension'])
  })

  it('is 10 questions/subtest at 60s/question', () => {
    expect(QUESTIONS_PER_SUBTEST).toBe(10)
    expect(SECONDS_PER_QUESTION).toBe(60)
  })
})

describe('resolveDiagnosticSubtests', () => {
  it('scopes to a single subtest when the param matches one of the 4', () => {
    expect(resolveDiagnosticSubtests('Science')).toEqual(['Science'])
  })

  it('covers all 4 subtests when the param is missing', () => {
    expect(resolveDiagnosticSubtests(undefined)).toEqual([...DIAGNOSTIC_SUBTESTS])
  })

  it('covers all 4 subtests when the param is unrecognized', () => {
    expect(resolveDiagnosticSubtests('Not A Subtest')).toEqual([...DIAGNOSTIC_SUBTESTS])
  })
})

describe('buildDiagnosticQuestions', () => {
  it('builds up to perSubtest questions per requested subtest from the bank', () => {
    const rows = [
      ...Array.from({ length: 15 }, (_, i) => row({ questionId: `M${i}`, subtest: 'Mathematics' })),
      ...Array.from({ length: 15 }, (_, i) => row({ questionId: `S${i}`, subtest: 'Science' })),
    ]
    const out = buildDiagnosticQuestions(rows, ['Mathematics', 'Science'], 10, () => 0)
    expect(out.filter(q => q.subject === 'Mathematics')).toHaveLength(10)
    expect(out.filter(q => q.subject === 'Science')).toHaveLength(10)
  })

  it('falls back to bundled items scoped to the requested subtests when the bank is empty', () => {
    const out = buildDiagnosticQuestions([], ['Mathematics'], 10)
    expect(out.length).toBeGreaterThan(0)
    expect(out.every(q => q.subject === 'Mathematics')).toBe(true)
  })

  it('returns [] — never the cross-subject bundle — when nothing exists for the requested subtest (e.g. Reading Comprehension)', () => {
    expect(buildDiagnosticQuestions([], ['Reading Comprehension'], 10)).toEqual([])
  })

  it('skips passage-linked rows (setId set) — mirrors buildPreAssessFromUpcat', () => {
    const rows = [row({ questionId: 'R1', subtest: 'Reading Comprehension', setId: 'PASS-1' })]
    const out = buildDiagnosticQuestions(rows, ['Reading Comprehension'], 10)
    // Bank yields nothing (only row is passage-linked) and the bundle has no
    // Reading Comprehension items → empty, so the screen shows its empty state.
    expect(out).toEqual([])
  })

  it('backfills only the subtest the bank yielded zero questions for (mixed coverage), leaving the others bank-sourced', () => {
    const rows = [
      // Mathematics: every row is passage-linked → buildPreAssessFromUpcat filters
      // all of them out, so the bank yields zero standalone Mathematics questions
      // even though the bank build overall is non-empty (Science/LP/RC below).
      ...Array.from({ length: 12 }, (_, i) => row({ questionId: `M${i}`, subtest: 'Mathematics', setId: 'PASS-M' })),
      ...Array.from({ length: 12 }, (_, i) => row({ questionId: `S${i}`, subtest: 'Science' })),
      ...Array.from({ length: 12 }, (_, i) => row({ questionId: `L${i}`, subtest: 'Language Proficiency' })),
      ...Array.from({ length: 12 }, (_, i) => row({ questionId: `R${i}`, subtest: 'Reading Comprehension' })),
    ]
    const out = buildDiagnosticQuestions(rows, [...DIAGNOSTIC_SUBTESTS], 10, () => 0)

    // All 4 subtests must be represented — the defect was silently dropping the
    // subtest whose bank rows were all filtered out.
    for (const subtest of DIAGNOSTIC_SUBTESTS) {
      expect(out.some(q => q.subject === subtest)).toBe(true)
    }

    // Bank-covered subtests are untouched: 10 each, straight from the bank rows.
    expect(out.filter(q => q.subject === 'Science')).toHaveLength(10)
    expect(out.filter(q => q.subject === 'Language Proficiency')).toHaveLength(10)
    expect(out.filter(q => q.subject === 'Reading Comprehension')).toHaveLength(10)

    // Mathematics (zero from the bank) is backfilled from the bundle — the bundle
    // only has 5 Mathematics-labeled items, so all 5 (not 10) are used, and they
    // must be exactly the bundled ones (ids prefixed pre-math-), not bank rows.
    const mathQuestions = out.filter(q => q.subject === 'Mathematics')
    expect(mathQuestions).toHaveLength(5)
    expect(mathQuestions.every(q => q.id.startsWith('pre-math-'))).toBe(true)
    expect(mathQuestions).toEqual(PRE_ASSESS_QUESTIONS.filter(q => q.subject === 'Mathematics'))
  })

  it('backfills the same way on the single-subject (?subject=) path', () => {
    // Simulates ?subject=Mathematics: only Mathematics is requested, and the bank
    // has rows for other subtests but zero standalone Mathematics rows.
    const rows = [
      ...Array.from({ length: 12 }, (_, i) => row({ questionId: `M${i}`, subtest: 'Mathematics', setId: 'PASS-M' })),
      ...Array.from({ length: 12 }, (_, i) => row({ questionId: `S${i}`, subtest: 'Science' })),
    ]
    const out = buildDiagnosticQuestions(rows, ['Mathematics'], 10, () => 0)
    expect(out.length).toBeGreaterThan(0)
    expect(out.every(q => q.subject === 'Mathematics')).toBe(true)
    expect(out).toEqual(PRE_ASSESS_QUESTIONS.filter(q => q.subject === 'Mathematics'))
  })
})

describe('scoreDiagnostic', () => {
  const questions = [
    { id: 'q1', subject: 'Mathematics', stem: '', options: [], answerIndex: 0, explanation: '' },
    { id: 'q2', subject: 'Mathematics', stem: '', options: [], answerIndex: 1, explanation: '' },
    { id: 'q3', subject: 'Science', stem: '', options: [], answerIndex: 0, explanation: '' },
  ]

  it('grades answered questions grouped by subject', () => {
    const answers = { 0: 0, 1: 1, 2: 1 } // q1 correct, q2 correct, q3 wrong
    const result = scoreDiagnostic(questions, answers)
    expect(result.overall).toEqual({ correct: 2, total: 3 })
    expect(result.bySubject).toEqual({
      Mathematics: { correct: 2, total: 2 },
      Science: { correct: 0, total: 1 },
    })
  })

  it('with a reached set, unreached questions are not counted and empty subjects are dropped', () => {
    const result = scoreDiagnostic(questions, { 0: 0 }, new Set([0, 1]))
    expect(result.overall).toEqual({ correct: 1, total: 2 })
    expect(result.bySubject).toEqual({ Mathematics: { correct: 1, total: 2 } })
  })

  it('treats unanswered questions (missing index) as incorrect', () => {
    const result = scoreDiagnostic(questions, {})
    expect(result.overall).toEqual({ correct: 0, total: 3 })
  })
})

describe('buildDiagnosticSessionParams', () => {
  it('emits one SessionParams row per subject shaped like the mock engines', () => {
    const bySubject = {
      Mathematics: { correct: 7, total: 10 },
      Science: { correct: 4, total: 10 },
    }
    const params = buildDiagnosticSessionParams(bySubject, 1_000)
    expect(params).toEqual([
      { listingSlug: 'upcat', topicId: '', deckId: '', score: 7, total: 10, startTime: 1_000, subtest: 'Mathematics', kind: 'diagnostic', attemptKey: 1_000 },
      { listingSlug: 'upcat', topicId: '', deckId: '', score: 4, total: 10, startTime: 1_000, subtest: 'Science', kind: 'diagnostic', attemptKey: 1_000 },
    ])
  })

  it('returns no rows when nothing was scored', () => {
    expect(buildDiagnosticSessionParams({}, 1_000)).toEqual([])
  })
})

describe('weakestSubject', () => {
  it('picks the subject with the lowest percentage', () => {
    const bySubject = {
      Mathematics: { correct: 9, total: 10 },
      Science: { correct: 3, total: 10 },
      'Language Proficiency': { correct: 5, total: 10 },
    }
    expect(weakestSubject(bySubject)).toBe('Science')
  })

  it('ignores subjects with zero attempted questions', () => {
    const bySubject = {
      Mathematics: { correct: 0, total: 0 },
      Science: { correct: 3, total: 10 },
    }
    expect(weakestSubject(bySubject)).toBe('Science')
  })

  it('returns null when nothing was attempted', () => {
    expect(weakestSubject({})).toBeNull()
  })
})

describe('isBundledDiagnosticId (A5)', () => {
  it('recognises the static bundle ids so they are never recorded as upcat_questions attempts', () => {
    expect(isBundledDiagnosticId('pre-math-1')).toBe(true)
    expect(isBundledDiagnosticId(PRE_ASSESS_QUESTIONS[0]!.id)).toBe(true)
    expect(isBundledDiagnosticId('M001')).toBe(false)
  })
})
