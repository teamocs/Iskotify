// Pure helper for Home's "Subject preparedness" grid (SubjectPreparednessGrid).
//
// Unlike utils/subjectsToImprove.ts (which falls back to raw flashcard accuracy
// when a subject has NO session data at all, for the practice tab's "Subjects to
// improve" list), this grid is a strict readiness snapshot: subjectReadinessPct
// only, 0% when nothing is known yet (Global Constraints — no invented formula).
//
// No React, no DB — fully unit-testable.

import { subjectReadinessPct } from './subjectReadiness'

export interface SubjectTopicRow {
  topic: { id: string; subjectId: string }
}

export interface SubjectPreparednessEntry {
  id: string
  name: string
  pct: number
}

export const SUBJECT_PREPAREDNESS_LIMIT = 6

/**
 * subjectPreparedness — per-subject readiness (0–100, ascending — lowest/most
 * in-need first), capped to `limit` subjects. Only subjects with at least one
 * topic are included.
 */
export function subjectPreparedness(
  topicRows: SubjectTopicRow[],
  subjects: Array<{ id: string; name: string }>,
  perTopicBestById: Map<string, number>,
  subjectBestByName: Map<string, number>,
  limit: number = SUBJECT_PREPAREDNESS_LIMIT,
): SubjectPreparednessEntry[] {
  const nameById = new Map(subjects.map(s => [s.id, s.name]))

  const topicsBySubject = new Map<string, Array<{ id: string }>>()
  const order: string[] = []
  for (const row of topicRows) {
    const sid = row.topic.subjectId
    let bucket = topicsBySubject.get(sid)
    if (!bucket) {
      bucket = []
      topicsBySubject.set(sid, bucket)
      order.push(sid)
    }
    bucket.push({ id: row.topic.id })
  }

  const result: SubjectPreparednessEntry[] = order.map(sid => {
    const topics = topicsBySubject.get(sid)!
    const name = nameById.get(sid) ?? sid
    const pct = subjectReadinessPct(topics, perTopicBestById, name, subjectBestByName) ?? 0
    return { id: sid, name, pct }
  })

  result.sort((a, b) => a.pct - b.pct)
  return result.slice(0, limit)
}
