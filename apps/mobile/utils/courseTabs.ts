// Pure helper: resolve a user's target-course list to concrete courseTab identifiers
// (the primary key used in course_taxonomy_map / course_school_rankings).

export interface CourseTabOption {
  courseTab: string
  label: string
}

/**
 * Map a user's target courses to `CourseTabOption` values by:
 *   1. id starting with "tax:" → courseTab = id minus the "tax:" prefix, label = course.label
 *   2. Otherwise → look up taxonomyRows by careerCourseId → use that row's courseTab and
 *      its label ?? course.label
 *   3. Unresolvable (no careerCourseId, no tax: prefix, no matching taxonomy row) → skip
 *   4. Dedupe by courseTab, keeping the first occurrence
 */
export function resolveCourseTabs(
  targetCourses: Array<{ id: string; label: string; careerCourseId: string | null }>,
  taxonomyRows: Array<{ courseTab: string; careerCourseId: string | null; label: string | null }>,
): CourseTabOption[] {
  const seen = new Set<string>()
  const result: CourseTabOption[] = []

  for (const course of targetCourses) {
    let resolved: CourseTabOption | null = null

    if (course.id.startsWith('tax:')) {
      // Direct tax: reference — strip prefix to get the courseTab
      const courseTab = course.id.slice(4)
      resolved = { courseTab, label: course.label }
    } else if (course.careerCourseId) {
      // Look up the taxonomy row by careerCourseId
      const taxRow = taxonomyRows.find(r => r.careerCourseId === course.careerCourseId)
      if (taxRow) {
        resolved = { courseTab: taxRow.courseTab, label: taxRow.label ?? course.label }
      }
    }
    // else: no careerCourseId and no tax: prefix → skip (unresolvable)

    if (resolved && !seen.has(resolved.courseTab)) {
      seen.add(resolved.courseTab)
      result.push(resolved)
    }
  }

  return result
}
