// Turns the student's answered-question telemetry (question_attempts) into the
// four UPCAT subtest scores the estimator needs. A subtest only counts once the
// student has answered enough questions in it — the estimator never fills a gap
// with a population average, because that would show a campus verdict the
// student hasn't earned.

export const MIN_ANSWERS = 20
export const WINDOW = 60

export type SubtestKey = 'math' | 'reading' | 'language' | 'science'

const SUBTESTS: Record<string, SubtestKey> = {
  'Mathematics': 'math',
  'Reading Comprehension': 'reading',
  'Language Proficiency': 'language',
  'Science': 'science',
}

/**
 * The four UPCAT subtest labels as stored in question_attempts.subtest — the
 * single source of truth for any caller that needs to pre-filter a query to
 * just these (e.g. hooks/useAdmissionEstimate.ts bounding its attempts scan
 * to avoid loading up to 5,000 unrelated rows).
 */
export const UPCAT_SUBTEST_LABELS: string[] = Object.keys(SUBTESTS)

export interface SubtestScore {
  /** Percent correct over the latest WINDOW answers, or null until MIN_ANSWERS. */
  percent: number | null
  answered: number
  /** Answers still needed to unlock this subtest (0 when ready). */
  needed: number
}

export type Readiness = Record<SubtestKey, SubtestScore> & { ready: boolean }

export interface AttemptLike {
  subtest: string | null
  correct: boolean
  answeredAt: number
}

export function subtestReadiness(attempts: AttemptLike[]): Readiness {
  const bySubtest: Record<SubtestKey, AttemptLike[]> = { math: [], reading: [], language: [], science: [] }
  for (const a of attempts) {
    const key = a.subtest ? SUBTESTS[a.subtest] : undefined
    if (key) bySubtest[key].push(a)
  }

  const score = (list: AttemptLike[]): SubtestScore => {
    const recent = [...list].sort((a, b) => b.answeredAt - a.answeredAt).slice(0, WINDOW)
    const answered = recent.length
    if (answered < MIN_ANSWERS) return { percent: null, answered, needed: MIN_ANSWERS - answered }
    const correct = recent.filter(a => a.correct).length
    return { percent: Math.round((correct / answered) * 1000) / 10, answered, needed: 0 }
  }

  const math = score(bySubtest.math)
  const reading = score(bySubtest.reading)
  const language = score(bySubtest.language)
  const science = score(bySubtest.science)
  return {
    math, reading, language, science,
    ready: [math, reading, language, science].every(s => s.percent !== null),
  }
}
