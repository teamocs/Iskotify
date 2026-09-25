import {
  ONBOARDING_STEPS, stepPosition, nextStep, prevStep, resumeStep, isOptional,
} from '../flow'

describe('onboarding flow', () => {
  it('asks one question per step, in this order', () => {
    expect(ONBOARDING_STEPS.map(s => s.id)).toEqual([
      'name', 'grade', 'school', 'goals', 'courses', 'income', 'gwa', 'province', 'check',
    ])
  })

  it('reports the position for the progress indicator', () => {
    expect(stepPosition('name')).toEqual({ index: 1, total: 9, section: 'About you' })
    expect(stepPosition('goals')).toEqual({ index: 4, total: 9, section: 'Your goal' })
    expect(stepPosition('gwa')).toEqual({ index: 7, total: 9, section: 'Scholarship match' })
    expect(stepPosition('check')).toEqual({ index: 9, total: 9, section: 'Quick check' })
  })

  it('moves forward and back, stopping at the ends', () => {
    expect(nextStep('name')).toBe('grade')
    expect(nextStep('province')).toBe('check')
    expect(nextStep('check')).toBeNull()
    expect(prevStep('grade')).toBe('name')
    expect(prevStep('name')).toBeNull()
  })

  it('only the name, grade and goal are required', () => {
    const required = ONBOARDING_STEPS.filter(s => !isOptional(s.id)).map(s => s.id)
    expect(required).toEqual(['name', 'grade', 'goals'])
  })

  describe('resumeStep (resume-safe: the saved answers decide where to pick up)', () => {
    it('starts at the name for a brand-new student', () => {
      expect(resumeStep({})).toBe('name')
      expect(resumeStep({ fullName: '   ' })).toBe('name')
    })

    it('skips the name when it is already saved (e.g. from Google sign-in)', () => {
      expect(resumeStep({ fullName: 'Juan' })).toBe('grade')
    })

    it('resumes at the goal once name and grade are saved', () => {
      expect(resumeStep({ fullName: 'Juan', gradeLevel: 11 })).toBe('goals')
    })

    it('resumes after the goal when a focus exam or scholarship already exists', () => {
      expect(resumeStep({ fullName: 'Juan', gradeLevel: 11, hasFocus: true })).toBe('courses')
    })
  })
})
