// Mistakes mode (P4): retry the UPCAT bank questions a student got wrong and
// hasn't answered correctly since. Pure: the rows come from
// services/questionHistory getOpenMistakeIds, the run is served by the UPCAT
// runner (app/practice/upcat/[subtest].tsx, variant 'mistakes').

import { groupIntoUnits, isMissingRequiredFigure, type ExamQuestion, type RawUpcatPassage, type RawUpcatQuestion } from './upcatExam'

/** At most this many mistakes per run (passage-set members that weren't missed ride along uncounted). */
export const MISTAKES_SESSION_SIZE = 20

/** Onboarding / diagnostic pre-assessment ids: never part of the bank's mistakes. */
const PRE_PREFIX = 'pre-'

export interface AnsweredAttempt {
  questionId: string
  answeredAt: number
  correct: boolean
}

/**
 * Open mistakes from ANSWERED attempts (selected_index not null; skips are not
 * answers): questions whose latest answer is wrong. A correct answer at the
 * same moment as a wrong one counts as fixed. Newest mistake first.
 */
export function openMistakeIds(rows: readonly AnsweredAttempt[]): string[] {
  const latest = new Map<string, { at: number; correct: boolean }>()
  for (const r of rows) {
    if (r.questionId.startsWith(PRE_PREFIX)) continue
    const cur = latest.get(r.questionId)
    if (!cur || r.answeredAt > cur.at) latest.set(r.questionId, { at: r.answeredAt, correct: r.correct })
    else if (r.answeredAt === cur.at && r.correct) cur.correct = true
  }
  return [...latest.entries()]
    .filter(([, v]) => !v.correct)
    .sort((a, b) => b[1].at - a[1].at)
    .map(([id]) => id)
}

export interface MistakesExam {
  questions: ExamQuestion[]
  /** The questions in `questions` that are actual mistakes (the rest are passage-set companions). */
  mistakeIds: Set<string>
}

/**
 * Build a Mistakes run from the published pool: mistakes in the given order
 * (newest first), each passage set served whole (sorted by setPosition, with
 * its passage) when any member is a mistake, counting only the missed members
 * toward `limit`. A unit that would push the count past `limit` is skipped;
 * smaller ones further down may still fit. Ids no longer in the pool, and
 * questions whose required figure is missing, are left out.
 */
export function buildMistakesExam(
  pool: readonly RawUpcatQuestion[],
  passages: readonly RawUpcatPassage[],
  mistakeIds: readonly string[],
  limit: number = MISTAKES_SESSION_SIZE,
): MistakesExam {
  const usable = pool.filter(q => !isMissingRequiredFigure(q))
  const byId = new Map(usable.map(q => [q.questionId, q]))
  const setUnits = new Map<string, RawUpcatQuestion[]>()
  for (const unit of groupIntoUnits(usable)) {
    const setId = unit[0]?.setId
    if (setId) setUnits.set(setId, unit)
  }
  const passageById = new Map(passages.map(p => [p.setId, p.passageText]))
  const wanted = new Set(mistakeIds)

  const out: RawUpcatQuestion[] = []
  const marked = new Set<string>()
  const emittedSets = new Set<string>()
  for (const id of mistakeIds) {
    if (marked.size >= limit) break
    const q = byId.get(id)
    if (!q || marked.has(id)) continue
    if (q.setId && emittedSets.has(q.setId)) continue
    const unit = q.setId ? (setUnits.get(q.setId) ?? [q]) : [q]
    const missed = unit.filter(m => wanted.has(m.questionId))
    if (marked.size > 0 && marked.size + missed.length > limit) continue
    if (q.setId) emittedSets.add(q.setId)
    out.push(...unit)
    for (const m of missed) marked.add(m.questionId)
  }
  return {
    questions: out.map(q => ({ ...q, passageText: q.setId ? (passageById.get(q.setId) ?? null) : null })),
    mistakeIds: marked,
  }
}
