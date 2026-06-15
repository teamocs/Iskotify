// Pure helper for Home's "Subjects to improve" grid.
//
// Per-subject mastery = average of that subject's NON-NULL topic accuracies,
// rounded. A subject that has topics but none graded yet scores 0 (so it surfaces
// as "needs work"). Only subjects that have at least one topic are included.
// Sorted ascending by pct so the lowest / most-need-first subjects lead the grid.

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
): SubjectMastery[] {
  const nameById = new Map(subjects.map(s => [s.id, s.name]))

  // Group accuracies by subjectId; track which subjects have ≥1 topic.
  const sums = new Map<string, { sum: number; n: number }>()
  const order: string[] = []
  for (const row of topicRows) {
    const sid = row.topic.subjectId
    let bucket = sums.get(sid)
    if (!bucket) {
      bucket = { sum: 0, n: 0 }
      sums.set(sid, bucket)
      order.push(sid)
    }
    if (row.accuracy != null) {
      bucket.sum += row.accuracy
      bucket.n += 1
    }
  }

  const result: SubjectMastery[] = order.map(sid => {
    const { sum, n } = sums.get(sid)!
    const pct = n > 0 ? Math.round(sum / n) : 0
    return { id: sid, name: nameById.get(sid) ?? sid, pct }
  })

  result.sort((a, b) => a.pct - b.pct)
  return result
}
