// Pure helper for Progress's "Readiness by subject" list.
//
// A strict readiness snapshot: subjectReadinessPct only. A subject with too few
// answered questions has pct null ("Not started") — it used to be coerced to
// 0% and shown as "needs work" for something the student simply hadn't tried.
//
// No React, no DB — fully unit-testable.

import { subjectReadinessPct } from './subjectReadiness'

export interface SubjectTopicRow {
  topic: { id: string; subjectId: string }
}

export interface SubjectPreparednessEntry {
  id: string
  name: string
  /** 0–100, or null when there is not enough practice yet ("Not started"). */
  pct: number | null
}

export const SUBJECT_PREPAREDNESS_LIMIT = 6

/**
 * subjectPreparedness — per-subject readiness, lowest (most in need) first,
 * subjects with no number last, capped to `limit`. Only subjects with at least
 * one topic are included.
 */
export function subjectPreparedness(
  topicRows: SubjectTopicRow[],
  subjects: Array<{ id: string; name: string }>,
  subjectPctByName: Map<string, number>,
  limit: number = SUBJECT_PREPAREDNESS_LIMIT,
): SubjectPreparednessEntry[] {
  const nameById = new Map(subjects.map(s => [s.id, s.name]))

  const order: string[] = []
  const seen = new Set<string>()
  for (const row of topicRows) {
    const sid = row.topic.subjectId
    if (!seen.has(sid)) { seen.add(sid); order.push(sid) }
  }

  const result: SubjectPreparednessEntry[] = order.map(sid => {
    const name = nameById.get(sid) ?? sid
    return { id: sid, name, pct: subjectReadinessPct(name, subjectPctByName) }
  })

  result.sort((a, b) => {
    if ((a.pct == null) !== (b.pct == null)) return a.pct == null ? 1 : -1
    return (a.pct ?? 0) - (b.pct ?? 0)
  })
  return result.slice(0, limit)
}
