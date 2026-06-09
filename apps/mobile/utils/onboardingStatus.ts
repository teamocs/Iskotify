// Single source of truth for "has this user completed onboarding focus?".
//
// Historically this was `selectedListingSlug || focusCount > 0`, which only counts
// CONTENT listings. But a user can validly onboard by selecting a target exam that
// has no authored content (only a handful of exams map to a `listings.slug`). Those
// users persisted an EMPTY focus + a non-empty `targetExams`, so the launch check
// looped them back to onboarding on every relaunch. Onboarding-completion must be
// derived from "did they pick a target", not "do we have content for it".

/** True when the JSON string encodes a non-empty array (the persisted target exams). */
export function hasTargetExams(json: string | null | undefined): boolean {
  if (!json) return false
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) && v.length > 0
  } catch {
    return false
  }
}

/**
 * Whether the user has chosen an onboarding focus (exam and/or scholarship).
 * Caller checks `fullName` separately to distinguish landing vs onboarding.
 */
export function hasOnboardingFocus(args: {
  selectedListingSlug?: string | null
  focusCount: number
  targetExams?: string | null
}): boolean {
  if (args.selectedListingSlug && args.selectedListingSlug.trim().length > 0) return true
  if (args.focusCount > 0) return true
  return hasTargetExams(args.targetExams)
}
