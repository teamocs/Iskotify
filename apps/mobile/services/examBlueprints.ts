import { eq, asc, inArray } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { examBlueprints, examBlueprintSections, examCourseNotes, upcatQuestions, upcatPassages } from '../db/schema'
import type { RawUpcatQuestion, RawUpcatPassage } from '../utils/upcatExam'

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

function parseOptions(raw: string | null | undefined): string[] {
  try { const v = JSON.parse(raw ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}

/** Load local questions for the given skill categories, grouped by category, parsed into
 *  the shape the builder/exam engine expects. */
export async function getQuestionsByCategory(db: DrizzleClient, categories: string[]): Promise<Map<string, RawUpcatQuestion[]>> {
  const map = new Map<string, RawUpcatQuestion[]>()
  if (categories.length === 0) return map
  const rows = await db.select().from(upcatQuestions).where(inArray(upcatQuestions.skillCategory, categories))
  for (const r of rows) {
    const cat = r.skillCategory ?? ''
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push({
      questionId: r.questionId, subtest: r.subtest, questionText: r.questionText,
      options: parseOptions(r.options), correctIndex: r.correctIndex, explanation: r.explanation,
      setId: r.setId, setPosition: r.setPosition,
    })
  }
  return map
}

export async function getAllPassages(db: DrizzleClient): Promise<RawUpcatPassage[]> {
  const rows = await db.select().from(upcatPassages)
  return rows.map(p => ({ setId: p.setId, subtest: p.subtest, passageText: p.passageText }))
}
