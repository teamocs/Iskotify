// Pure helpers for "focus a whole school" — a namespaced focus slug used when a
// school has no content-backed exam listing. Kept in their own module (not in
// hooks/useFocusListings) so components that mock the hook in tests still get the
// real helpers.

export const SCHOOL_FOCUS_PREFIX = 'school:'

/** Build a focus slug that pins a whole school (by tertiary_schools.id). */
export function schoolFocusSlug(schoolId: string): string {
  return `${SCHOOL_FOCUS_PREFIX}${schoolId}`
}

/** True when a focus slug refers to a whole school rather than an exam listing. */
export function isSchoolFocusSlug(slug: string): boolean {
  return slug.startsWith(SCHOOL_FOCUS_PREFIX)
}

/** Extract the tertiary_schools.id from a school focus slug. */
export function schoolIdFromFocusSlug(slug: string): string {
  return slug.slice(SCHOOL_FOCUS_PREFIX.length)
}
