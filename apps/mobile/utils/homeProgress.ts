// Pure helpers for the Home screen's "Your Progress" analytics section.
// No React, no DB — fully unit-testable.

export interface SubjectMastery {
  name: string
  pct: number
}

interface MasteryTopicRow {
  topic: { id: string; name: string; subjectId: string }
  accuracy: number | null
}

/**
 * subjectMastery — group practice topicRows by subject and compute each subject's
 * mastery as the average of its topics' non-null `accuracy` (0–100, already rounded
 * upstream). Subjects with no graded topics (all accuracy null) are dropped so the
 * UI never shows an em-dash row. subjectId → name via `subjects[]` (falls back to the
 * id when unknown). Result is sorted LOWEST mastery first — the most useful to study.
 */
export function subjectMastery(
  topicRows: MasteryTopicRow[],
  subjects: Array<{ id: string; name: string }>,
): SubjectMastery[] {
  const nameById = new Map(subjects.map(s => [s.id, s.name]))

  // Accumulate sum + count of graded (non-null) accuracies per subjectId.
  const acc = new Map<string, { sum: number; count: number }>()
  for (const row of topicRows) {
    if (row.accuracy == null) continue
    const sid = row.topic.subjectId
    const a = acc.get(sid) ?? { sum: 0, count: 0 }
    a.sum += row.accuracy
    a.count += 1
    acc.set(sid, a)
  }

  const out: SubjectMastery[] = []
  for (const [sid, { sum, count }] of acc.entries()) {
    if (count === 0) continue // defensive — entries only exist with count ≥ 1
    out.push({ name: nameById.get(sid) ?? sid, pct: Math.round(sum / count) })
  }

  // Lowest mastery first (study these next); tie-break alphabetically for stability.
  return out.sort((a, b) => a.pct - b.pct || a.name.localeCompare(b.name))
}
