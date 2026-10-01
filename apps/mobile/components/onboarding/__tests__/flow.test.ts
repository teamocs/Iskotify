import {
  ONBOARDING_STEPS, stepPosition, nextStep, prevStep, resumeStep, isOptional, furthestStep,
} from '../flow'

const C = { consented: true, sensitive: true }

describe('onboarding flow', () => {
  it('asks one question per step, in this order (consent first, the sensitive opt-in before income)', () => {
    expect(ONBOARDING_STEPS.map(s => s.id)).toEqual([
      'consent', 'name', 'grade', 'school', 'goals', 'courses', 'sensitive', 'income', 'gwa', 'province', 'check',
    ])
  })

  it('reports the position for the progress indicator', () => {
    expect(stepPosition('consent', true)).toEqual({ index: 1, total: 11, section: 'About you' })
    expect(stepPosition('name', true)).toEqual({ index: 2, total: 11, section: 'About you' })
    expect(stepPosition('goals', true)).toEqual({ index: 5, total: 11, section: 'Your goal' })
    expect(stepPosition('gwa', true)).toEqual({ index: 9, total: 11, section: 'Scholarship match' })
    expect(stepPosition('check', true)).toEqual({ index: 11, total: 11, section: 'Quick check' })
  })

  it('does not count the skipped income and GWA steps when the student declined the sensitive opt-in', () => {
    expect(stepPosition('sensitive', false)).toEqual({ index: 7, total: 9, section: 'Scholarship match' })
    expect(stepPosition('province', false)).toEqual({ index: 8, total: 9, section: 'Scholarship match' })
    expect(stepPosition('check', false)).toEqual({ index: 9, total: 9, section: 'Quick check' })
  })

  it('moves forward and back, stopping at the ends', () => {
    expect(nextStep('consent', true)).toBe('name')
    expect(nextStep('name', true)).toBe('grade')
    expect(nextStep('courses', true)).toBe('sensitive')
    expect(nextStep('sensitive', true)).toBe('income')
    expect(nextStep('province', true)).toBe('check')
    expect(nextStep('check', true)).toBeNull()
    expect(prevStep('grade', true)).toBe('name')
    expect(prevStep('name', true)).toBe('consent')
    expect(prevStep('consent', true)).toBeNull()
  })

  it('skips the income and GWA steps without sensitive consent, in both directions', () => {
    expect(nextStep('sensitive', false)).toBe('province')
    expect(prevStep('province', false)).toBe('sensitive')
    expect(prevStep('province', true)).toBe('gwa')
  })

  it('only consent, name, grade, the goal and the opt-in cannot be skipped', () => {
    const required = ONBOARDING_STEPS.filter(s => !isOptional(s.id)).map(s => s.id)
    expect(required).toEqual(['consent', 'name', 'grade', 'goals', 'sensitive'])
  })

  describe('resumeStep (resume-safe: the saved answers decide where to pick up)', () => {
    it('starts at the name for a brand-new student who already consented', () => {
      expect(resumeStep({ ...C })).toBe('name')
      expect(resumeStep({ ...C, fullName: '   ' })).toBe('name')
    })

    it('skips the name when it is already saved (e.g. from Google sign-in)', () => {
      expect(resumeStep({ ...C, fullName: 'Juan' })).toBe('grade')
    })

    it('resumes at the goal once name and grade are saved', () => {
      expect(resumeStep({ ...C, fullName: 'Juan', gradeLevel: 11 })).toBe('goals')
    })

    it('resumes after the goal when a focus exam or scholarship already exists', () => {
      expect(resumeStep({ ...C, fullName: 'Juan', gradeLevel: 11, hasFocus: true })).toBe('courses')
    })

    it('with no saved progress marker, falls back to the first unanswered required question', () => {
      expect(resumeStep({ ...C, fullName: 'Juan', gradeLevel: 11, hasFocus: true, furthest: '' })).toBe('courses')
      expect(resumeStep({ ...C, fullName: 'Juan', gradeLevel: 11, furthest: 'nonsense' })).toBe('goals')
    })
  })

  describe('resumeStep with the furthest step reached (optional answers can be skipped)', () => {
    const base = { ...C, fullName: 'Juan', gradeLevel: 11 }

    it('after the grade, resumes at the (optional) school, not past it', () => {
      expect(resumeStep({ ...base, furthest: 'grade' })).toBe('school')
    })

    it('after skipping the school, resumes at the goal', () => {
      expect(resumeStep({ ...base, furthest: 'school' })).toBe('goals')
    })

    it('after the goal, resumes at the step after the furthest one reached', () => {
      expect(resumeStep({ ...base, hasFocus: true, furthest: 'goals' })).toBe('courses')
      expect(resumeStep({ ...base, hasFocus: true, furthest: 'courses' })).toBe('sensitive')
      expect(resumeStep({ ...base, hasFocus: true, furthest: 'sensitive' })).toBe('income')
      expect(resumeStep({ ...base, hasFocus: true, furthest: 'gwa' })).toBe('province')
      expect(resumeStep({ ...base, hasFocus: true, furthest: 'province' })).toBe('check')
    })

    it('reports a finished onboarding as done, so the flow is not re-entered', () => {
      expect(resumeStep({ ...base, hasFocus: true, furthest: 'check' })).toBe('done')
      expect(resumeStep({ ...base, hasFocus: true, furthest: 'done' })).toBe('done')
    })

    it('never skips a required answer that is missing, whatever the marker says', () => {
      expect(resumeStep({ ...C, fullName: '', gradeLevel: 11, hasFocus: true, furthest: 'done' })).toBe('name')
      expect(resumeStep({ ...C, fullName: 'Juan', hasFocus: true, furthest: 'province' })).toBe('grade')
      expect(resumeStep({ ...base, hasFocus: false, furthest: 'province' })).toBe('goals')
      expect(resumeStep({ ...base, hasFocus: false, furthest: 'done' })).toBe('goals')
    })
  })

  describe('resumeStep with the consent and the sensitive opt-in', () => {
    const base = { fullName: 'Juan', gradeLevel: 11, hasFocus: true }

    it('always asks for consent first when it is missing, whatever the saved progress', () => {
      expect(resumeStep({ ...base, consented: false, sensitive: false, furthest: 'courses' })).toBe('consent')
      expect(resumeStep({ ...base, consented: false, sensitive: false, furthest: 'done' })).toBe('consent')
      expect(resumeStep({ consented: false, sensitive: false })).toBe('consent')
    })

    it('a brand-new student who just consented continues at the name', () => {
      expect(resumeStep({ consented: true, sensitive: false, furthest: 'consent' })).toBe('name')
    })

    it('skips income and GWA on resume when the sensitive opt-in is off', () => {
      expect(resumeStep({ ...base, consented: true, sensitive: false, furthest: 'sensitive' })).toBe('province')
      expect(resumeStep({ ...base, consented: true, sensitive: false, furthest: 'courses' })).toBe('sensitive')
    })

    it('a legacy marker past the opt-in still skips income and GWA without consent', () => {
      expect(resumeStep({ ...base, consented: true, sensitive: false, furthest: 'school' })).toBe('goals')
      expect(resumeStep({ ...base, consented: true, sensitive: false, furthest: 'income' })).toBe('province')
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
      expect(furthestStep('name', 'consent')).toBe('name')
    })
  })
})
