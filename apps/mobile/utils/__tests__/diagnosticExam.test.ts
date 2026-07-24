import {
  DIAGNOSTIC_SUBTESTS,
  QUESTIONS_PER_SUBTEST,
  SECONDS_PER_QUESTION,
  resolveDiagnosticSubtests,
  buildDiagnosticQuestions,
  scoreDiagnostic,
  buildDiagnosticSessionParams,
  weakestSubject,
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

  it('falls back to the whole bundle when the bundle has no matching subject (e.g. Reading Comprehension)', () => {
    const out = buildDiagnosticQuestions([], ['Reading Comprehension'], 10)
    expect(out).toEqual(PRE_ASSESS_QUESTIONS)
  })

  it('skips passage-linked rows (setId set) — mirrors buildPreAssessFromUpcat', () => {
    const rows = [row({ questionId: 'R1', subtest: 'Reading Comprehension', setId: 'PASS-1' })]
    const out = buildDiagnosticQuestions(rows, ['Reading Comprehension'], 10)
    // Bank yields nothing (only row is passage-linked) → falls back to the bundle.
    expect(out).toEqual(PRE_ASSESS_QUESTIONS)
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
      { listingSlug: 'upcat', topicId: '', deckId: '', score: 7, total: 10, startTime: 1_000, subtest: 'Mathematics' },
      { listingSlug: 'upcat', topicId: '', deckId: '', score: 4, total: 10, startTime: 1_000, subtest: 'Science' },
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
