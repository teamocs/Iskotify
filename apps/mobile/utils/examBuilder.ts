import type { ExamBlueprint, BlueprintSection } from '../services/examBlueprints'
import type { RawUpcatQuestion, RawUpcatPassage, ExamQuestion } from './upcatExam'

export interface BuiltSection { section: BlueprintSection; questions: ExamQuestion[]; available: number }
export interface BuiltExam { runnable: BuiltSection[]; comingSoon: BlueprintSection[]; totalQuestions: number }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!] }
  return a
}

/** Build a timed mock from a blueprint: each section samples up to item_count questions
 *  from its skill_category pool. Sections whose pool is empty are returned as comingSoon
 *  (shown in the structure preview, excluded from the runnable timed exam). Passage sets
 *  are kept contiguous and the passage text is attached. */
export function buildBlueprintExam(
  blueprint: ExamBlueprint,
  questionsByCategory: Map<string, RawUpcatQuestion[]>,
  passages: RawUpcatPassage[],
): BuiltExam {
  const passageById = new Map(passages.map(p => [p.setId, p.passageText]))
  const runnable: BuiltSection[] = []
  const comingSoon: BlueprintSection[] = []
  for (const section of [...blueprint.sections].sort((a, b) => a.displayOrder - b.displayOrder)) {
    const pool = questionsByCategory.get(section.skillCategory) ?? []
    if (pool.length === 0) { comingSoon.push(section); continue }
    const picked = shuffle(pool).slice(0, Math.max(1, section.itemCount))
    const questions: ExamQuestion[] = picked.map(q => ({ ...q, passageText: q.setId ? (passageById.get(q.setId) ?? null) : null }))
    runnable.push({ section, questions, available: pool.length })
  }
  return { runnable, comingSoon, totalQuestions: runnable.reduce((n, s) => n + s.questions.length, 0) }
}

export interface PenaltyScore { raw: number; adjusted: number; correct: number; wrong: number; blank: number }

/** Raw = correct; adjusted subtracts penalty×wrong when the exam has a guessing penalty
 *  (blanks are never penalized). */
export function scoreBlueprintExam(total: number, correct: number, wrong: number, hasPenalty: boolean, penalty: number): PenaltyScore {
  const blank = Math.max(0, total - correct - wrong)
  const adjusted = hasPenalty ? correct - penalty * wrong : correct
  return { raw: correct, adjusted, correct, wrong, blank }
}

export interface CourseNote { courseCluster: string; note: string; minPercentile: number | null }

/** Keep universal ("all") notes plus any whose cluster the student is targeting.
 *  Empty clusters (student set no target courses) → return all notes unfiltered. */
export function filterCourseNotesByClusters<T extends { courseCluster: string }>(notes: T[], clusters: string[]): T[] {
  if (clusters.length === 0) return notes
  const set = new Set(clusters.map(c => c.trim().toLowerCase()))
  return notes.filter(n => {
    const c = n.courseCluster.trim().toLowerCase()
    return c === 'all' || set.has(c)
  })
}

export interface PercentileBand { percentile: number; band: string; blurb: string }

/** Honest, distribution-free estimate: percentile ≈ raw % correct, clamped to [1,99].
 *  Labelled "estimated" in the UI — NOT a normed score. */
export function estimatePercentileBand(pct: number): PercentileBand {
  const percentile = Math.max(1, Math.min(99, Math.round(pct)))
  let band: string, blurb: string
  if (percentile >= 90) { band = 'Top tier'; blurb = 'On track for the most selective programs.' }
  else if (percentile >= 75) { band = 'Competitive'; blurb = 'Strong — competitive for many programs.' }
  else if (percentile >= 50) { band = 'Developing'; blurb = 'Building up — keep drilling weak sections.' }
  else { band = 'Foundational'; blurb = 'Focus on fundamentals before timed mocks.' }
  return { percentile, band, blurb }
}
