// Which exam the diagnostic samples, and the short blueprint-based diagnostic
// used for every exam other than UPCAT. UPCAT keeps the original per-subtest
// diagnostic (utils/diagnosticExam.ts) untouched. Pure: no React, no DB.

import type { PreAssessQuestion } from '../data/preAssessment'
import type { ExamBlueprint, BlueprintSection } from '../services/examBlueprints'
import type { SessionParams } from '../hooks/useRecordSession'
import type { AttemptQuestionMeta } from './attemptRows'
import { buildBlueprintExam } from './examBuilder'
import { groupSectionResults, questionSubtest } from './examSubmit'
import { runKeyFor } from './examRunPersistence'
import type { ExamQuestion, RawUpcatPassage, RawUpcatQuestion } from './upcatExam'

export type DiagnosticTarget =
  | { kind: 'upcat' }
  | { kind: 'blueprint'; slug: string }
  | { kind: 'unavailable'; slug: string }

export interface ResolveDiagnosticTargetInput {
  /** `?exam=<slug>` route param. */
  examParam?: string | null
  /** `?subject=<UPCAT subtest>` route param (only ever set by UPCAT-specific entry points). */
  subjectParam?: string | null
  /** The student's focus exams in priority order (school-level entries are ignored: they match no blueprint). */
  focusSlugs: readonly string[]
  /** Slugs of published blueprints that can actually be built now (services/examBlueprints listRunnableBlueprints). */
  runnableSlugs: readonly string[]
}

/**
 * resolveDiagnosticTarget — an explicit `?exam=` wins (and is honest when it
 * has no runnable blueprint); otherwise a UPCAT subject scope keeps the UPCAT
 * diagnostic; otherwise the primary focus exam that has a runnable blueprint;
 * otherwise UPCAT (the original behaviour).
 */
export function resolveDiagnosticTarget(input: ResolveDiagnosticTargetInput): DiagnosticTarget {
  const { examParam, subjectParam, focusSlugs, runnableSlugs } = input
  const fromSlug = (slug: string): DiagnosticTarget => (slug === 'upcat' ? { kind: 'upcat' } : { kind: 'blueprint', slug })
  if (examParam) {
    if (examParam === 'upcat') return { kind: 'upcat' }
    return runnableSlugs.includes(examParam) ? fromSlug(examParam) : { kind: 'unavailable', slug: examParam }
  }
  if (subjectParam) return { kind: 'upcat' }
  const primary = focusSlugs.find(s => runnableSlugs.includes(s))
  return primary ? fromSlug(primary) : { kind: 'upcat' }
}

/** How an exam with no blueprint acronym is named in copy: its slug, in capitals ("dcat-dlsu" -> "DCAT-DLSU"). */
export function examSlugLabel(slug: string): string {
  return typeof slug === 'string' ? slug.toUpperCase() : ''
}

/** A route param as one string: the first value of an array, else the value itself. */
export function firstParam(v: string | string[] | undefined | null): string | undefined {
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === 'string' ? s : undefined
}

/** `?exam=` as a slug: first value, trimmed, lowercased; undefined when blank. */
export function normalizeExamParam(v: string | string[] | undefined | null): string | undefined {
  const s = firstParam(v)?.trim().toLowerCase()
  return s ? s : undefined
}

/** Whole-diagnostic budget for an exam diagnostic (a finished passage can overshoot slightly). */
export const BLUEPRINT_DIAGNOSTIC_MAX_QUESTIONS = 30
const BLUEPRINT_DIAGNOSTIC_PER_SECTION = 5
const BLUEPRINT_DIAGNOSTIC_MIN_PER_SECTION = 2

/**
 * Questions sampled per section: 5, shrinking (never below 2) only for an exam
 * with so many sections that 5 each would pass 30 questions in total.
 */
export function blueprintDiagnosticSectionSize(sectionCount: number): number {
  if (sectionCount <= 0) return BLUEPRINT_DIAGNOSTIC_PER_SECTION
  return Math.max(
    BLUEPRINT_DIAGNOSTIC_MIN_PER_SECTION,
    Math.min(BLUEPRINT_DIAGNOSTIC_PER_SECTION, Math.floor(BLUEPRINT_DIAGNOSTIC_MAX_QUESTIONS / sectionCount)),
  )
}

export interface BuiltBlueprintDiagnostic {
  /** Flat, in section order. `subject` = section display name, `subtest` = canonical subtest. */
  questions: PreAssessQuestion[]
  /** Sections with no runnable content yet, shown as "not available yet". */
  comingSoon: BlueprintSection[]
}

/** An ExamQuestion as a diagnostic question under a section label. */
export function toDiagnosticQuestion(q: ExamQuestion, sectionName: string): PreAssessQuestion {
  return {
    id: q.questionId,
    subject: sectionName,
    subtest: q.subtest,
    topic: q.topic ?? null,
    stem: q.questionText,
    options: q.options,
    answerIndex: q.correctIndex,
    explanation: q.explanation ?? '',
    optionExplanations: q.optionExplanations ?? undefined,
    strategyTip: q.strategyTip || undefined,
    imageUrl: q.imageUrl ?? null,
    imageAlt: q.imageAlt ?? null,
    imageWidth: q.imageWidth ?? null,
    imageHeight: q.imageHeight ?? null,
    passageText: q.passageText,
  }
}

/**
 * buildBlueprintDiagnostic — one block per runnable blueprint section with a
 * small sample each (blueprintDiagnosticSectionSize, never above the section's
 * own item_count). Reuses the mock builder, so passage sets stay whole and
 * contiguous, figure-less questions are excluded, a question is never served
 * in two sections, and an empty section is skipped (returned as comingSoon).
 */
export function buildBlueprintDiagnostic(
  blueprint: ExamBlueprint,
  questionsByCategory: Map<string, RawUpcatQuestion[]>,
  passages: RawUpcatPassage[],
): BuiltBlueprintDiagnostic {
  const size = blueprintDiagnosticSectionSize(blueprint.sections.length)
  const built = buildBlueprintExam(blueprint, questionsByCategory, passages, sec => Math.min(size, sec.itemCount))
  return {
    questions: built.runnable.flatMap(bs => bs.questions.map(q => toDiagnosticQuestion(q, bs.section.name))),
    comingSoon: built.comingSoon,
  }
}

/**
 * Every runnable question of the blueprint's categories as diagnostic questions
 * (no section label yet; the passage attached), de-duplicated by id. Used to
 * rebuild a saved run's exact question set: the saved ids pick and order from it.
 */
export function blueprintDiagnosticPool(
  questionsByCategory: Map<string, RawUpcatQuestion[]>,
  passages: RawUpcatPassage[],
): PreAssessQuestion[] {
  const passageById = new Map(passages.map(p => [p.setId, p.passageText]))
  const byId = new Map<string, PreAssessQuestion>()
  for (const list of questionsByCategory.values()) {
    for (const q of list) {
      if (byId.has(q.questionId)) continue
      byId.set(q.questionId, toDiagnosticQuestion({ ...q, passageText: q.setId ? (passageById.get(q.setId) ?? null) : null }, ''))
    }
  }
  return [...byId.values()]
}

/** Adapts diagnostic questions to the shape utils/examSubmit groups by (section label + canonical subtest). */
function asSubmitQuestions(questions: readonly PreAssessQuestion[]) {
  return questions.map(q => ({
    sectionName: q.subject,
    q: { subtest: q.subtest ?? '', correctIndex: q.answerIndex },
  }))
}

/**
 * One practice_sessions row per reached section: kind 'diagnostic' under the
 * exam's slug, attemptKey = the sitting start, `subtest` = the section's
 * canonical subtest (never the display name), via the same grouping the mock
 * exams record with.
 */
export function buildBlueprintDiagnosticSessionParams(
  slug: string,
  questions: readonly PreAssessQuestion[],
  answers: Record<number, number>,
  reached: ReadonlySet<number> | undefined,
  startTime: number,
): SessionParams[] {
  return groupSectionResults(asSubmitQuestions(questions), answers, reached).map(r => ({
    listingSlug: slug,
    topicId: '',
    deckId: '',
    score: r.correct,
    total: r.total,
    startTime,
    subtest: r.subtest,
    kind: 'diagnostic' as const,
    attemptKey: startTime,
  }))
}

/** Per-question attempt metadata: canonical subtest (section label only as a last resort) + topic. */
export function blueprintDiagnosticToAttemptMeta(questions: readonly PreAssessQuestion[]): AttemptQuestionMeta[] {
  const submit = asSubmitQuestions(questions)
  return questions.map((q, i) => ({
    questionId: q.id,
    correctIndex: q.answerIndex,
    subtest: questionSubtest(submit[i]!),
    topic: q.topic ?? null,
  }))
}

/** Saved-run key. UPCAT keeps its original keys; an exam diagnostic is keyed by the exam so runs never cross over. */
export function diagnosticRunKey(target: DiagnosticTarget, subjectParam: string | null | undefined): string {
  if (target.kind === 'blueprint') return runKeyFor('diagnostic', target.slug, 'exam')
  return runKeyFor('diagnostic', subjectParam ?? 'all')
}

/** The `slug` column stored on the saved run (UPCAT: the subject scope or 'all', as before). */
export function diagnosticRunSlug(target: DiagnosticTarget, subjectParam: string | null | undefined): string {
  return target.kind === 'blueprint' ? target.slug : (subjectParam ?? 'all')
}
