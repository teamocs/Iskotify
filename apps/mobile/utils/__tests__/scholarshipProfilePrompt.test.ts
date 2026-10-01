import { scholarshipProfileGaps, shouldShowScholarshipPrompt, scholarshipPromptMessage } from '../scholarshipProfilePrompt'

const COMPLETE = {
  school: 'Pasig High',
  province: 'Albay',
  targetCourses: '[{"id":"tax:bscs","label":"BS Computer Science","careerCourseId":null}]',
  sensitiveConsentAt: 1_700_000_000_000,
  gwa: 90.5,
  profilePromptDismissedAt: 0,
}

describe('scholarshipProfileGaps (what the short onboarding no longer asks)', () => {
  it('is empty for a complete profile', () => {
    expect(scholarshipProfileGaps(COMPLETE)).toEqual([])
  })

  it('lists every missing part, in the order the profile screen shows them', () => {
    expect(scholarshipProfileGaps({})).toEqual(['school', 'target courses', 'province', 'grades and income'])
  })

  it('treats blank text and an empty course list as missing', () => {
    expect(scholarshipProfileGaps({ ...COMPLETE, school: '  ', province: '', targetCourses: '[]' }))
      .toEqual(['school', 'target courses', 'province'])
    expect(scholarshipProfileGaps({ ...COMPLETE, targetCourses: 'not json' })).toEqual(['target courses'])
  })

  it('asks for grades and income until the opt-in is given and a GWA is saved', () => {
    expect(scholarshipProfileGaps({ ...COMPLETE, sensitiveConsentAt: 0 })).toEqual(['grades and income'])
    expect(scholarshipProfileGaps({ ...COMPLETE, gwa: null })).toEqual(['grades and income'])
  })

  it('never re-asks for grades and income after the student said no (RA 10173 sensitive data)', () => {
    expect(scholarshipProfileGaps({ ...COMPLETE, sensitiveConsentAt: 0, sensitiveWithdrawnAt: 1_700_000_000_000 })).toEqual([])
  })

  it('never nudges an under-18 student toward sharing grades and income', () => {
    expect(scholarshipProfileGaps({ ...COMPLETE, sensitiveConsentAt: 0, ageBand: 'minor' })).toEqual([])
  })

  it('still asks an adult who opted in but has no GWA yet', () => {
    expect(scholarshipProfileGaps({ ...COMPLETE, gwa: null, ageBand: 'adult' })).toEqual(['grades and income'])
  })
})

describe('shouldShowScholarshipPrompt', () => {
  it('shows while something is missing and the student has not dismissed it', () => {
    expect(shouldShowScholarshipPrompt({ ...COMPLETE, school: '' })).toBe(true)
  })

  it('stays hidden once dismissed', () => {
    expect(shouldShowScholarshipPrompt({ ...COMPLETE, school: '', profilePromptDismissedAt: 5 })).toBe(false)
  })

  it('stays hidden for a complete profile, and when nothing is known yet', () => {
    expect(shouldShowScholarshipPrompt(COMPLETE)).toBe(false)
    expect(shouldShowScholarshipPrompt(null)).toBe(false)
  })
})

describe('scholarshipPromptMessage', () => {
  it('names what is missing in plain words', () => {
    expect(scholarshipPromptMessage(['school'])).toBe('Add your school to see the scholarships you can apply for.')
    expect(scholarshipPromptMessage(['school', 'province'])).toBe('Add your school and province to see the scholarships you can apply for.')
    expect(scholarshipPromptMessage(['school', 'target courses', 'province', 'grades and income']))
      .toBe('Add your school, target courses, province, and grades and income to see the scholarships you can apply for.')
  })
})
