// Pure question-building/scoring helpers for the standalone Diagnostic exam
// (10 questions/subtest, no React/DB). Mirrors the onboarding pre-assessment
// question source and the UPCAT mock-exam scoring/session-recording shape so
// results feed the same subject-readiness aggregates.

import { PRE_ASSESS_QUESTIONS, type PreAssessQuestion } from '../data/preAssessment'
import { buildPreAssessFromUpcat, type UpcatLocalRow } from './preAssessmentSource'
import { SUBTESTS, scoreExam } from './upcatExam'
import type { SessionParams } from '../hooks/useRecordSession'

/** All 4 UPCAT subtests the diagnostic can cover (canonical list, reused from upcatExam.ts). */
export const DIAGNOSTIC_SUBTESTS: readonly string[] = SUBTESTS

export const QUESTIONS_PER_SUBTEST = 10
export const SECONDS_PER_QUESTION = 60

/**
 * resolveDiagnosticSubtests — the `?subject=` route param scopes the diagnostic to a
 * single subtest when it's one of the 4 known names; any other value (missing,
 * unrecognized) covers all 4.
 */
export function resolveDiagnosticSubtests(subjectParam?: string | null): string[] {
  if (subjectParam && DIAGNOSTIC_SUBTESTS.includes(subjectParam)) return [subjectParam]
  return [...DIAGNOSTIC_SUBTESTS]
}

/**
 * buildDiagnosticQuestions — 10 questions per requested subtest from the exam-tagged
 * bank (buildPreAssessFromUpcat). Falls back to the bundled static items
 * (data/preAssessment.ts) when the bank yields nothing for the requested subtests —
 * same fallback onboarding.tsx uses. The fallback is scoped to the requested
 * subtests when the bundle has matching questions (its taxonomy covers Mathematics
 * and Science); otherwise it falls back further to the whole bundle rather than
 * showing no questions at all (the bundle has no Language Proficiency / Reading
 * Comprehension-labeled items).
 *
 * The bank build is per-subtest under the hood (each subtest's rows are filtered/
 * shuffled independently), so it's possible for the bank to yield questions for
 * some requested subtests but zero for another (e.g. every Reading Comprehension
 * row is passage-linked, which buildPreAssessFromUpcat excludes). When that
 * happens, only the affected subtest is backfilled from the bundle (its own
 * subject's items, up to perSubtest) — bank-covered subtests are left untouched.
 * A fully-empty bank build (every requested subtest has zero) still takes the
 * whole-bundle fallback above as a natural consequence of this per-subtest check.
 */
export function buildDiagnosticQuestions(
  rows: UpcatLocalRow[],
  subtests: string[],
  perSubtest: number = QUESTIONS_PER_SUBTEST,
  rng: () => number = Math.random,
): PreAssessQuestion[] {
  const built = buildPreAssessFromUpcat(rows, subtests, perSubtest, rng)
  if (built.length === 0) {
    const scoped = PRE_ASSESS_QUESTIONS.filter(q => subtests.includes(q.subject))
    return scoped.length > 0 ? scoped : PRE_ASSESS_QUESTIONS
  }

  const covered = new Set(built.map(q => q.subject))
  const missing = subtests.filter(st => !covered.has(st))
  if (missing.length === 0) return built

  const backfill = missing.flatMap(st =>
    PRE_ASSESS_QUESTIONS.filter(q => q.subject === st).slice(0, perSubtest),
  )
  return [...built, ...backfill]
}

export interface DiagnosticScore {
  overall: { correct: number; total: number }
  bySubject: Record<string, { correct: number; total: number }>
}

/** scoreDiagnostic — grades answered questions, grouped by subject (reuses scoreExam). */
export function scoreDiagnostic(
  questions: PreAssessQuestion[],
  answers: Record<number, number>,
): DiagnosticScore {
  const scored = questions.map((q, i) => ({ subtest: q.subject, correct: answers[i] === q.answerIndex }))
  const { overall, bySubtest } = scoreExam(scored)
  return { overall, bySubject: bySubtest }
}

/**
 * buildDiagnosticSessionParams — one useRecordSession param set per subject, mirroring
 * the mock engines (topicId: '', subtest: <subject name>) so results feed
 * getSubjectSessionPercentages → subjectReadinessPct.
 */
export function buildDiagnosticSessionParams(
  bySubject: Record<string, { correct: number; total: number }>,
  startTime: number,
): SessionParams[] {
  return Object.entries(bySubject).map(([subject, b]) => ({
    listingSlug: 'upcat',
    topicId: '',
    deckId: '',
    score: b.correct,
    total: b.total,
    startTime,
    subtest: subject,
  }))
}

/** weakestSubject — the subject with the lowest %, ignoring subjects with 0 attempted. */
export function weakestSubject(
  bySubject: Record<string, { correct: number; total: number }>,
): string | null {
  let worst: string | null = null
  let worstPct = Infinity
  for (const [subject, b] of Object.entries(bySubject)) {
    if (b.total === 0) continue
    const pct = (b.correct / b.total) * 100
    if (pct < worstPct) {
      worstPct = pct
      worst = subject
    }
  }
  return worst
}
