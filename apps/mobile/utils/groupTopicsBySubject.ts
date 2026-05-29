export type SortMode = 'accuracy-asc' | 'accuracy-desc' | 'alpha'

export interface SubjectGroup<T> {
  subjectId: string
  subjectName: string
  rows: T[]
  summary?: string
}

interface GroupInput<R extends { id: string; name: string; subjectId: string; accuracy?: number | null }> {
  topics: R[]
  subjects: Array<{ id: string; name: string }>
  focusListingSlugs?: string[]
  topicIdsByListingSlug?: Record<string, string[]>
}

/**
 * Pure helper: filter topics by focus list, group by subject, sort, map to caller's row type.
 * Drops subjects with no topics. See spec §4.2 for full behavior.
 */
export function groupTopicsBySubject<
  R extends { id: string; name: string; subjectId: string; accuracy?: number | null },
  T,
>(
  input: GroupInput<R>,
  rowFor: (topic: R) => T,
  summaryFor?: (rows: T[], rawTopics: R[]) => string,
  sort: SortMode = 'alpha',
): SubjectGroup<T>[] {
  const { topics, subjects, focusListingSlugs, topicIdsByListingSlug } = input

  // 1. Focus-list filter (only when both inputs present)
  let allowed: Set<string> | null = null
  if (focusListingSlugs && focusListingSlugs.length > 0 && topicIdsByListingSlug) {
    allowed = new Set<string>()
    for (const slug of focusListingSlugs) {
      const ids = topicIdsByListingSlug[slug] ?? []
      for (const id of ids) allowed.add(id)
    }
  }
  const filtered = allowed ? topics.filter(t => allowed!.has(t.id)) : topics

  // 2. Group by subjectId
  const buckets = new Map<string, R[]>()
  for (const t of filtered) {
    if (!buckets.has(t.subjectId)) buckets.set(t.subjectId, [])
    buckets.get(t.subjectId)!.push(t)
  }

  // 3. Build groups, looking up subject name from subjects array
  const subjectNameById = new Map(subjects.map(s => [s.id, s.name]))
  const groups: SubjectGroup<T>[] = []
  for (const [subjectId, raws] of buckets.entries()) {
    // 4. Sort topics inside this subject
    const sortedRaws = sortTopics(raws, sort)
    // 5. Map to caller's row type
    const rows = sortedRaws.map(rowFor)
    groups.push({
      subjectId,
      subjectName: subjectNameById.get(subjectId) ?? subjectId,
      rows,
      summary: summaryFor ? summaryFor(rows, sortedRaws) : undefined,
    })
  }

  // 6. Sort subjects
  return sortGroups(groups, buckets, sort)
}

function accuracyOf(t: { accuracy?: number | null }, sort: SortMode): number {
  if (t.accuracy != null) return t.accuracy
  // Null accuracy: 0 in asc (sorts to top — "study these next"), -1 in desc (sorts to bottom)
  return sort === 'accuracy-asc' ? 0 : -1
}

function sortTopics<R extends { name: string; accuracy?: number | null }>(rows: R[], sort: SortMode): R[] {
  const copy = [...rows]
  if (sort === 'alpha') {
    copy.sort((a, b) => a.name.localeCompare(b.name))
  } else if (sort === 'accuracy-asc') {
    copy.sort((a, b) => accuracyOf(a, sort) - accuracyOf(b, sort))
  } else {
    // accuracy-desc
    copy.sort((a, b) => accuracyOf(b, sort) - accuracyOf(a, sort))
  }
  return copy
}

function sortGroups<T>(
  groups: SubjectGroup<T>[],
  bucketsByName: Map<string, Array<{ accuracy?: number | null }>>,
  sort: SortMode,
): SubjectGroup<T>[] {
  const copy = [...groups]
  if (sort === 'alpha') {
    copy.sort((a, b) => a.subjectName.localeCompare(b.subjectName))
    return copy
  }
  // Compute avg accuracy per subject for the comparison
  const avgById = new Map<string, number>()
  for (const [id, raws] of bucketsByName.entries()) {
    let sum = 0
    let n = 0
    for (const r of raws) {
      sum += accuracyOf(r, sort)
      n++
    }
    avgById.set(id, n > 0 ? sum / n : 0)
  }
  if (sort === 'accuracy-asc') {
    copy.sort((a, b) => (avgById.get(a.subjectId) ?? 0) - (avgById.get(b.subjectId) ?? 0))
  } else {
    copy.sort((a, b) => (avgById.get(b.subjectId) ?? 0) - (avgById.get(a.subjectId) ?? 0))
  }
  return copy
}
