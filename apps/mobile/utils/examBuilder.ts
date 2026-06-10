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
