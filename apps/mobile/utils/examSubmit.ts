// Pure scoring/grouping for the blueprint exam's submit(): which canonical
// subtest each attempt/session row is written under. Kept out of the screen so
// it is unit-testable.

/** The slice of a flattened exam question this module needs. */
export interface SubmitQuestion {
  sectionName: string
  q: { subtest: string; correctIndex: number }
}

export interface SectionResult {
  /** Display name (blueprint section) — for the results UI only, never persisted as `subtest`. */
  sectionName: string
  /** Canonical subtest (upcat_questions.subtest) the rows are persisted under. */
  subtest: string
  correct: number
  total: number
}

/**
 * A question's canonical subtest. Section display names such as
 * 'Language Proficiency (English & Filipino)' match no known subtest, so
 * readiness/estimator lookups by label silently missed them; the question's
 * own subtest is the stable key. The section name is only a last resort.
 */
export function questionSubtest(fq: SubmitQuestion): string {
  return fq.q.subtest?.trim() || fq.sectionName
}

/** Most frequent value (first seen wins a tie); null for an empty list. */
export function mostCommonSubtest(subtests: string[]): string | null {
  const counts = new Map<string, number>()
  for (const s of subtests) counts.set(s, (counts.get(s) ?? 0) + 1)
  let best: string | null = null
  let bestCount = 0
  for (const [s, n] of counts) {
    if (n > bestCount) { best = s; bestCount = n }
  }
  return best
}

/**
 * Per-section correct/total in first-seen order. A section's questions share
 * one skill_category and so one subtest; if they ever mix, the most common wins.
 */
export function groupSectionResults(
  questions: readonly SubmitQuestion[],
  answers: Record<number, number>,
): SectionResult[] {
  const order: string[] = []
  const by = new Map<string, { correct: number; total: number; subtests: string[] }>()
  questions.forEach((fq, i) => {
    let cur = by.get(fq.sectionName)
    if (!cur) {
      cur = { correct: 0, total: 0, subtests: [] }
      by.set(fq.sectionName, cur)
      order.push(fq.sectionName)
    }
    cur.total++
    cur.subtests.push(questionSubtest(fq))
    if (answers[i] === fq.q.correctIndex) cur.correct++
  })
  return order.map(sectionName => {
    const b = by.get(sectionName)!
    return {
      sectionName,
      subtest: mostCommonSubtest(b.subtests) ?? sectionName,
      correct: b.correct,
      total: b.total,
    }
  })
}
