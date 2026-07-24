// The "Free Tuition" filter used to only look at university_profiles.free_tuition,
// which silently dropped the ~324 schools with no university_profiles row at all
// (freeTuition null/undefined) — even though most of those are SUCs/LUCs, which
// RA 10931 (Universal Access to Quality Tertiary Education Act) already covers.
// This predicate treats is_suc / is_luc as free-tuition signals too, alongside
// an explicit profile flag. Pure so it's trivial to unit-test (see
// __tests__/freeTuitionFilter.test.ts).

export interface FreeTuitionSchoolFlags {
  isSuc: boolean
  isLuc: boolean
}

export function passesFreeTuitionFilter(
  school: FreeTuitionSchoolFlags,
  profileFreeTuition: boolean | null | undefined,
): boolean {
  return profileFreeTuition === true || school.isSuc || school.isLuc
}
