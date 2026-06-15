// Pure helper for Home's "Subjects to improve" grid.
//
// Per-subject mastery is SESSION-based and consistent with Subject Details: it is
// subjectReadinessPct over the subject's topics — the average of each topic's
// readiness, where a topic's readiness = max(its own topic-review best, the
// subject-level mock best). A mock covering a subject (subtest == subject name)
// lifts every topic in it; an individual topic review can exceed the mock.
//
// Flashcard user_progress accuracy is a FALLBACK only: when a subject has no
// session data at all (no per-topic review bests and no subject-level mock best),
// the subject's % is the average of its non-null topic accuracies (0 if none
// graded yet, so it still surfaces as "needs work").
//
// Only subjects with at least one topic are included. Sorted ascending by pct so
// the lowest / most-need-first subjects lead the grid.

import { topicReadiness, subjectReadinessPct } from './subjectReadiness'

export interface TopicAccuracyRow {
  topic: { id: string; name: string; subjectId: string }
  accuracy: number | null
}

export interface SubjectMastery {
  id: string
  name: string
  pct: number
}

export function subjectsToImprove(
  topicRows: TopicAccuracyRow[],
  subjects: Array<{ id: string; name: string }>,
  // Per-topic best topic-review session %, keyed by topicId.
  perTopicBestById: Map<string, number>,
  // Subject-level mock best %, keyed by the subject NAME (subtest == subject name).
  subjectBestByName: Map<string, number>,
): SubjectMastery[] {
  const nameById = new Map(subjects.map(s => [s.id, s.name]))

  // Group the subject's topics + flashcard accuracies; preserve first-seen order.
  const groups = new Map<string, { topics: Array<{ id: string }>; accSum: number; accN: number }>()
  const order: string[] = []
  for (const row of topicRows) {
    const sid = row.topic.subjectId
    let bucket = groups.get(sid)
    if (!bucket) {
      bucket = { topics: [], accSum: 0, accN: 0 }
      groups.set(sid, bucket)
      order.push(sid)
    }
    bucket.topics.push({ id: row.topic.id })
    if (row.accuracy != null) {
      bucket.accSum += row.accuracy
      bucket.accN += 1
    }
  }

  const result: SubjectMastery[] = order.map(sid => {
    const { topics, accSum, accN } = groups.get(sid)!
    const name = nameById.get(sid) ?? sid

    // PRIMARY: session-based readiness (so mock-practiced subjects show real %).
    const sessionPct = subjectReadinessPct(topics, perTopicBestById, name, subjectBestByName)

    let pct: number
    if (sessionPct != null) {
      pct = sessionPct
    } else {
      // FALLBACK: flashcard accuracy average (0 when nothing graded yet).
      pct = accN > 0 ? Math.round(accSum / accN) : 0
    }

    return { id: sid, name, pct }
  })

  result.sort((a, b) => a.pct - b.pct)
  return result
}

// Re-export so callers can compose per-topic readiness if needed.
export { topicReadiness }
