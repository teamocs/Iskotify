import {
  ONBOARDING_STEPS, stepPosition, nextStep, prevStep, resumeStep, isOptional, furthestStep,
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

    it('with no saved progress marker, falls back to the first unanswered required question', () => {
      expect(resumeStep({ fullName: 'Juan', gradeLevel: 11, hasFocus: true, furthest: '' })).toBe('courses')
      expect(resumeStep({ fullName: 'Juan', gradeLevel: 11, furthest: 'nonsense' })).toBe('goals')
    })
  })

  describe('resumeStep with the furthest step reached (optional answers can be skipped)', () => {
    const base = { fullName: 'Juan', gradeLevel: 11 }

    it('after the grade, resumes at the (optional) school, not past it', () => {
      expect(resumeStep({ ...base, furthest: 'grade' })).toBe('school')
    })

    it('after skipping the school, resumes at the goal', () => {
      expect(resumeStep({ ...base, furthest: 'school' })).toBe('goals')
    })

    it('after the goal, resumes at the step after the furthest one reached', () => {
      expect(resumeStep({ ...base, hasFocus: true, furthest: 'goals' })).toBe('courses')
      expect(resumeStep({ ...base, hasFocus: true, furthest: 'courses' })).toBe('income')
      expect(resumeStep({ ...base, hasFocus: true, furthest: 'gwa' })).toBe('province')
      expect(resumeStep({ ...base, hasFocus: true, furthest: 'province' })).toBe('check')
    })

    it('reports a finished onboarding as done, so the flow is not re-entered', () => {
      expect(resumeStep({ ...base, hasFocus: true, furthest: 'check' })).toBe('done')
      expect(resumeStep({ ...base, hasFocus: true, furthest: 'done' })).toBe('done')
    })

    it('never skips a required answer that is missing, whatever the marker says', () => {
      expect(resumeStep({ fullName: '', gradeLevel: 11, hasFocus: true, furthest: 'done' })).toBe('name')
      expect(resumeStep({ fullName: 'Juan', hasFocus: true, furthest: 'province' })).toBe('grade')
      expect(resumeStep({ ...base, hasFocus: false, furthest: 'province' })).toBe('goals')
      expect(resumeStep({ ...base, hasFocus: false, furthest: 'done' })).toBe('goals')
    })
  })

  describe('furthestStep (the persisted marker only moves forward)', () => {
    it('keeps the later of the saved marker and the step just completed', () => {
      expect(furthestStep('', 'name')).toBe('name')
      expect(furthestStep(null, 'grade')).toBe('grade')
      expect(furthestStep('gwa', 'grade')).toBe('gwa')
      expect(furthestStep('grade', 'gwa')).toBe('gwa')
      expect(furthestStep('done', 'courses')).toBe('done')
      expect(furthestStep('check', 'done')).toBe('done')
      expect(furthestStep('garbage', 'school')).toBe('school')
    })
  })
})
