// Data the diagnostic screen needs to pick and build the student's exam
// diagnostic. Thin wrappers over local SQLite; the pure logic lives in
// utils/diagnosticTarget.ts.
import { asc } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { focusListings } from '../db/schema'
import { isSchoolFocusSlug } from '../utils/focusSlug'
import {
  getExamBlueprint, getQuestionsByCategory, getAllPassages, listRunnableBlueprints,
  type ExamBlueprint, type RunnableBlueprint,
} from './examBlueprints'
import type { RawUpcatPassage, RawUpcatQuestion } from '../utils/upcatExam'

/** The student's focus exams (focus_listings, priority order); school-level focus entries are left out. */
export async function listFocusExamSlugs(db: DrizzleClient): Promise<string[]> {
  const rows = await db.select({ slug: focusListings.listingSlug }).from(focusListings).orderBy(asc(focusListings.priority))
  return rows.map(r => r.slug).filter(s => !isSchoolFocusSlug(s))
}

/** Published blueprints that have at least one runnable question right now. */
export function listRunnableDiagnosticBlueprints(db: DrizzleClient): Promise<RunnableBlueprint[]> {
  return listRunnableBlueprints(db)
}

export interface BlueprintDiagnosticSource {
  blueprint: ExamBlueprint
  questionsByCategory: Map<string, RawUpcatQuestion[]>
  passages: RawUpcatPassage[]
}

/** Blueprint + every runnable question of its sections + passages, or null when the blueprint is not published. */
export async function loadBlueprintDiagnosticSource(db: DrizzleClient, slug: string): Promise<BlueprintDiagnosticSource | null> {
  const blueprint = await getExamBlueprint(db, slug)
  if (!blueprint) return null
  const categories = Array.from(new Set(blueprint.sections.map(s => s.skillCategory)))
  const [questionsByCategory, passages] = await Promise.all([getQuestionsByCategory(db, categories), getAllPassages(db)])
  return { blueprint, questionsByCategory, passages }
}
