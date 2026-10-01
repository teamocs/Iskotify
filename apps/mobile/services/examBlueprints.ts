import { eq, asc, and, inArray, sql, count, or } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { examBlueprints, examBlueprintSections, examCourseNotes, upcatQuestions, upcatPassages, userSettings, careerCourses } from '../db/schema'
import { isMissingRequiredFigure, type RawUpcatQuestion, type RawUpcatPassage } from '../utils/upcatExam'
import { examMinutes, plannedItemCount } from '../utils/examBuilder'

export interface BlueprintSection {
  id: string; name: string; skillCategory: string; itemCount: number
  timeMinutes: number | null; requiresSpatialLogic: boolean; displayOrder: number
}
export interface ExamBlueprint {
  slug: string; name: string; acronym: string; totalItems: number; totalTimeMinutes: number
  hasGuessingPenalty: boolean; guessingPenalty: number; sectionBlocked: boolean
  scoringNote: string; mechanicsNote: string
  sections: BlueprintSection[]
  courseNotes: { courseCluster: string; note: string; minPercentile: number | null }[]
}

/** Load a single PUBLISHED blueprint + its ordered sections + course notes, or null. */
export async function getExamBlueprint(db: DrizzleClient, slug: string): Promise<ExamBlueprint | null> {
  const rows = await db.select().from(examBlueprints).where(eq(examBlueprints.slug, slug)).limit(1)
  const bp = rows[0]
  if (!bp || bp.status !== 'published') return null
  const sections = await db.select().from(examBlueprintSections)
    .where(eq(examBlueprintSections.blueprintSlug, slug)).orderBy(asc(examBlueprintSections.displayOrder))
  const notes = await db.select().from(examCourseNotes)
    .where(eq(examCourseNotes.blueprintSlug, slug)).orderBy(asc(examCourseNotes.displayOrder))
  return {
    slug: bp.slug, name: bp.name, acronym: bp.acronym, totalItems: bp.totalItems, totalTimeMinutes: bp.totalTimeMinutes,
    hasGuessingPenalty: !!bp.hasGuessingPenalty, guessingPenalty: bp.guessingPenalty, sectionBlocked: !!bp.sectionBlocked,
    scoringNote: bp.scoringNote, mechanicsNote: bp.mechanicsNote,
    sections: sections.map(s => ({
      id: s.id, name: s.name, skillCategory: s.skillCategory, itemCount: s.itemCount,
      timeMinutes: s.timeMinutes ?? null, requiresSpatialLogic: !!s.requiresSpatialLogic, displayOrder: s.displayOrder,
    })),
    courseNotes: notes.map(n => ({ courseCluster: n.courseCluster, note: n.note, minPercentile: n.minPercentile ?? null })),
  }
}

/** Published blueprint slugs, in display order — drives which listings can launch a mock. */
export async function listPublishedBlueprintSlugs(db: DrizzleClient): Promise<string[]> {
  const rows = await db.select({ slug: examBlueprints.slug, status: examBlueprints.status, order: examBlueprints.displayOrder })
    .from(examBlueprints).orderBy(asc(examBlueprints.displayOrder))
  return rows.filter(r => r.status === 'published').map(r => r.slug)
}

export interface PublishedBlueprint {
  slug: string
  name: string
  acronym: string
  totalItems: number
  totalTimeMinutes: number
}

/** Published blueprints with summary fields, ordered by displayOrder. */
export async function listPublishedBlueprints(db: DrizzleClient): Promise<PublishedBlueprint[]> {
  const rows = await db.select({
    slug: examBlueprints.slug,
    name: examBlueprints.name,
    acronym: examBlueprints.acronym,
    totalItems: examBlueprints.totalItems,
    totalTimeMinutes: examBlueprints.totalTimeMinutes,
    status: examBlueprints.status,
  }).from(examBlueprints).orderBy(asc(examBlueprints.displayOrder))
  return rows
    .filter(r => r.status === 'published')
    .map(r => ({
      slug: r.slug,
      name: r.name,
      acronym: r.acronym,
      totalItems: r.totalItems,
      totalTimeMinutes: r.totalTimeMinutes,
    }))
}

function parseOptions(raw: string | null | undefined): string[] {
  try { const v = JSON.parse(raw ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}

/** Load local questions for the given skill categories, grouped by category, parsed into
 *  the shape the builder/exam engine expects. */
export async function getQuestionsByCategory(db: DrizzleClient, categories: string[]): Promise<Map<string, RawUpcatQuestion[]>> {
  const map = new Map<string, RawUpcatQuestion[]>()
  if (categories.length === 0) return map
  const rows = await db.select().from(upcatQuestions)
    .where(and(inArray(upcatQuestions.skillCategory, categories), eq(upcatQuestions.status, 'published')))
  for (const r of rows) {
    const cat = r.skillCategory ?? ''
    const question: RawUpcatQuestion = {
      questionId: r.questionId, subtest: r.subtest, questionText: r.questionText,
      options: parseOptions(r.options), correctIndex: r.correctIndex, explanation: r.explanation,
      setId: r.setId, setPosition: r.setPosition,
      mainSubject: r.mainSubject ?? null, topic: r.topic ?? null,
      optionExplanations: parseOptions(r.optionExplanations) as (string | null)[],
      strategyTip: r.strategyTip ?? null,
      hasVisual: !!r.hasVisual,
      imageUrl: r.imageUrl ?? null,
      imageAlt: r.imageAlt ?? null,
      imageWidth: r.imageWidth ?? null,
      imageHeight: r.imageHeight ?? null,
    }
    // A student must never see "refer to the diagram" with no diagram —
    // exclude here at the source too (buildBlueprintExam/buildStudySprintExam
    // filter again defensively, but every caller of getQuestionsByCategory
    // should get an already-clean pool).
    if (isMissingRequiredFigure(question)) continue
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push(question)
  }
  return map
}

export async function getAllPassages(db: DrizzleClient): Promise<RawUpcatPassage[]> {
  const rows = await db.select().from(upcatPassages)
  return rows.map(p => ({ setId: p.setId, subtest: p.subtest, passageText: p.passageText }))
}

/** Resolve the student's target courses → the distinct career_courses.cluster names,
 *  used to filter a blueprint's course-cut-off notes. Empty array if none set. */
export async function getTargetCourseClusters(db: DrizzleClient): Promise<string[]> {
  const rows = await db.select({ tc: userSettings.targetCourses }).from(userSettings).where(eq(userSettings.id, 1)).limit(1)
  let parsed: { careerCourseId?: string | null }[] = []
  try { const v = JSON.parse(rows[0]?.tc ?? '[]'); if (Array.isArray(v)) parsed = v } catch { /* ignore */ }
  const ids = parsed.map(c => c?.careerCourseId).filter((x): x is string => !!x)
  if (ids.length === 0) return []
  const ccRows = await db.select({ cluster: careerCourses.cluster }).from(careerCourses).where(inArray(careerCourses.courseId, ids))
  const clusters = new Set<string>()
  for (const r of ccRows) if (r.cluster) clusters.add(r.cluster)
  return Array.from(clusters)
}

/**
 * How many runnable questions each skill category has, as a count query (no rows
 * loaded): status = 'published' and not "figure required but missing"
 * (has_visual with a null/empty image_url), the same filter getQuestionsByCategory
 * applies. For screens that only need "is it ready / how many items" and so must not
 * pull every question row.
 */
export async function getRunnableCountsByCategory(db: DrizzleClient, categories: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (categories.length === 0) return map
  const rows = await db.select({ category: upcatQuestions.skillCategory, n: count() }).from(upcatQuestions)
    .where(and(
      inArray(upcatQuestions.skillCategory, categories),
      eq(upcatQuestions.status, 'published'),
      or(eq(upcatQuestions.hasVisual, false), and(sql`${upcatQuestions.imageUrl} is not null`, sql`${upcatQuestions.imageUrl} <> ''`)),
    ))
    .groupBy(upcatQuestions.skillCategory)
  for (const r of rows) map.set(r.category ?? '', Number(r.n))
  return map
}

export interface RunnableBlueprint extends PublishedBlueprint {
  /** Items the exam would actually build now (sum of min(item_count, runnable) per section). */
  items: number
  /** The real timer: the section clocks for a section-locked exam, else the blueprint total. */
  minutes: number
}

/**
 * Published blueprints a student can actually take right now, sized and timed
 * the way the runner will build them. A published exam whose sections have no
 * runnable question (e.g. a Mechanical-Technical pool not written yet) is left
 * out, so Practice and Home never offer an empty exam.
 */
export async function listRunnableBlueprints(db: DrizzleClient): Promise<RunnableBlueprint[]> {
  const slugs = await listPublishedBlueprintSlugs(db)
  const blueprints = (await Promise.all(slugs.map(slug => getExamBlueprint(db, slug))))
    .filter((b): b is ExamBlueprint => b !== null)
  const categories = Array.from(new Set(blueprints.flatMap(b => b.sections.map(s => s.skillCategory))))
  const counts = await getRunnableCountsByCategory(db, categories)
  const out: RunnableBlueprint[] = []
  for (const bp of blueprints) {
    const items = plannedItemCount(bp.sections, counts)
    if (items <= 0) continue
    out.push({
      slug: bp.slug,
      name: bp.name,
      acronym: bp.acronym,
      totalItems: bp.totalItems,
      totalTimeMinutes: bp.totalTimeMinutes,
      items,
      minutes: examMinutes(bp),
    })
  }
  return out
}
