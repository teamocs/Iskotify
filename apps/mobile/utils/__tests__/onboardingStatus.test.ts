import { hasOnboardingFocus, hasTargetExams } from '../onboardingStatus'

describe('hasTargetExams', () => {
  it('is false for null/empty/invalid', () => {
    expect(hasTargetExams(null)).toBe(false)
    expect(hasTargetExams(undefined)).toBe(false)
    expect(hasTargetExams('')).toBe(false)
    expect(hasTargetExams('[]')).toBe(false)
    expect(hasTargetExams('not json')).toBe(false)
    expect(hasTargetExams('{}')).toBe(false)
  })

  it('is true for a non-empty array', () => {
    expect(hasTargetExams('[{"schoolId":"1","examAcronym":"WVSU"}]')).toBe(true)
  })
})

describe('hasOnboardingFocus', () => {
  it('true when a content listing slug is set', () => {
    expect(hasOnboardingFocus({ selectedListingSlug: 'upcat', focusCount: 0, targetExams: '[]' })).toBe(true)
  })

  it('true when there is at least one focus listing', () => {
    expect(hasOnboardingFocus({ selectedListingSlug: '', focusCount: 1, targetExams: '[]' })).toBe(true)
  })

  // THE BUG: a user picked an exam with no curated listing slug (no scholarship),
  // so slug='' and focusCount=0, but targetExams was persisted. They MUST count as
  // onboarded, not be looped back to onboarding.
  it('true when only target exams are set (exam without authored content)', () => {
    expect(hasOnboardingFocus({
      selectedListingSlug: '',
      focusCount: 0,
      targetExams: '[{"schoolId":"42","schoolName":"WVSU","examAcronym":"WVSUCAT"}]',
    })).toBe(true)
  })

  it('false for a brand-new / reset user with nothing chosen', () => {
    expect(hasOnboardingFocus({ selectedListingSlug: '', focusCount: 0, targetExams: '[]' })).toBe(false)
    expect(hasOnboardingFocus({ selectedListingSlug: null, focusCount: 0, targetExams: null })).toBe(false)
  })
})
