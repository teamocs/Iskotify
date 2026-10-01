import { studentProfileFromSettings, matchScholarship, scholarshipProfileIncomplete } from '../scholarshipMatch'

const SETTINGS = {
  gradeLevel: 11, incomeBracket: '100k-300k' as const, gwa: 91, province: 'Cebu', city: 'Cebu City',
}

const LISTING = {
  scope: 'national' as const, isVerified: true, incomeCeiling: 300000, gwaRequirement: 85, serviceObligationYears: null,
  province: null, city: null, targetYearLevels: [], hucExcluded: false,
}

describe('studentProfileFromSettings (what scholarship matching may use)', () => {
  it('with consent, passes income and GWA through', () => {
    expect(studentProfileFromSettings({ ...SETTINGS, sensitiveConsentAt: 5 })).toEqual({
      gradeLevel: 11, incomeBracket: '100k-300k', gwa: 91, province: 'Cebu', city: 'Cebu City',
    })
  })

  it('without consent, income and GWA read as not provided, location and grade level stay', () => {
    expect(studentProfileFromSettings({ ...SETTINGS, sensitiveConsentAt: 0 })).toEqual({
      gradeLevel: 11, incomeBracket: undefined, gwa: undefined, province: 'Cebu', city: 'Cebu City',
    })
  })

  it('without consent, matching degrades to "add your GWA to check", never an error or a verdict from hidden data', () => {
    const res = matchScholarship(LISTING, studentProfileFromSettings({ ...SETTINGS, sensitiveConsentAt: 0 }))
    expect(res.status).toBe('maybe')
    expect(res.warnings.join(' ')).toMatch(/add your GWA/i)
  })

  it('without consent the profile counts as incomplete, so the app prompts to add details', () => {
    expect(scholarshipProfileIncomplete({
      gwa: studentProfileFromSettings({ ...SETTINGS, sensitiveConsentAt: 0 }).gwa ?? null,
      province: 'Cebu', incomeBracket: null,
    })).toBe(true)
  })
})
