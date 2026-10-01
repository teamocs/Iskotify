import {
  ONBOARDING_STEPS, stepPosition, nextStep, prevStep, resumeStep, isOptional, furthestStep, normalizeMarker,
} from '../flow'

const C = { consented: true }

describe('onboarding flow (P4: four short steps)', () => {
  it('asks consent first, then about you, the exam, and the optional quick check', () => {
    expect(ONBOARDING_STEPS.map(s => s.id)).toEqual(['consent', 'about', 'goals', 'check'])
  })

  it('reports the position for the progress indicator: Step n of 4', () => {
    expect(stepPosition('consent')).toEqual({ index: 1, total: 4, section: 'Before we start' })
    expect(stepPosition('about')).toEqual({ index: 2, total: 4, section: 'About you' })
    expect(stepPosition('goals')).toEqual({ index: 3, total: 4, section: 'Your exam' })
    expect(stepPosition('check')).toEqual({ index: 4, total: 4, section: 'Quick check' })
  })

  it('moves forward and back, stopping at the ends', () => {
    expect(nextStep('consent')).toBe('about')
    expect(nextStep('about')).toBe('goals')
    expect(nextStep('goals')).toBe('check')
    expect(nextStep('check')).toBeNull()
    expect(prevStep('check')).toBe('goals')
    expect(prevStep('about')).toBe('consent')
    expect(prevStep('consent')).toBeNull()
  })

  it('only the quick check can be skipped', () => {
    expect(ONBOARDING_STEPS.filter(s => isOptional(s.id)).map(s => s.id)).toEqual(['check'])
  })

  describe('normalizeMarker (markers saved by the older 11-step flow)', () => {
    it('maps every old step id onto the new step it now belongs to', () => {
      expect(normalizeMarker('consent')).toBe('consent')
      expect(normalizeMarker('name')).toBe('consent')
      expect(normalizeMarker('grade')).toBe('about')
      expect(normalizeMarker('school')).toBe('about')
      expect(normalizeMarker('goals')).toBe('goals')
      for (const old of ['courses', 'sensitive', 'income', 'gwa', 'province']) {
        expect(normalizeMarker(old)).toBe('goals')
      }
      expect(normalizeMarker('check')).toBe('check')
      expect(normalizeMarker('done')).toBe('done')
    })

    it('keeps the new ids, and treats anything else as no marker', () => {
      expect(normalizeMarker('about')).toBe('about')
      expect(normalizeMarker('')).toBeNull()
      expect(normalizeMarker(null)).toBeNull()
      expect(normalizeMarker(undefined)).toBeNull()
      expect(normalizeMarker('nonsense')).toBeNull()
    })
  })

  describe('resumeStep (the saved answers decide where to pick up)', () => {
    it('starts at about-you for a brand-new student who already consented', () => {
      expect(resumeStep({ ...C })).toBe('about')
      expect(resumeStep({ ...C, fullName: '   ', gradeLevel: 11 })).toBe('about')
    })

    it('stays on about-you until both the name and the grade are saved', () => {
      expect(resumeStep({ ...C, fullName: 'Juan' })).toBe('about')
      expect(resumeStep({ ...C, gradeLevel: 11 })).toBe('about')
    })

    it('resumes at the exam once name and grade are saved', () => {
      expect(resumeStep({ ...C, fullName: 'Juan', gradeLevel: 11 })).toBe('goals')
    })

    it('without a marker, a saved focus resumes at the quick check', () => {
      expect(resumeStep({ ...C, fullName: 'Juan', gradeLevel: 11, hasFocus: true })).toBe('check')
      expect(resumeStep({ ...C, fullName: 'Juan', gradeLevel: 11, hasFocus: true, furthest: 'nonsense' })).toBe('check')
      expect(resumeStep({ ...C, fullName: 'Juan', gradeLevel: 11, furthest: 'nonsense' })).toBe('goals')
    })

    it('resumes at the step after the furthest one reached', () => {
      const base = { ...C, fullName: 'Juan', gradeLevel: 11, hasFocus: true }
      expect(resumeStep({ ...base, furthest: 'goals' })).toBe('check')
      expect(resumeStep({ ...base, furthest: 'check' })).toBe('done')
      expect(resumeStep({ ...base, furthest: 'done' })).toBe('done')
    })

    it('never skips a required answer that is missing, whatever the marker says', () => {
      expect(resumeStep({ ...C, fullName: '', gradeLevel: 11, hasFocus: true, furthest: 'done' })).toBe('about')
      expect(resumeStep({ ...C, fullName: 'Juan', hasFocus: true, furthest: 'check' })).toBe('about')
      expect(resumeStep({ ...C, fullName: 'Juan', gradeLevel: 11, hasFocus: false, furthest: 'done' })).toBe('goals')
    })

    it('always asks for consent first when it is missing, whatever the saved progress', () => {
      expect(resumeStep({ consented: false, fullName: 'Juan', gradeLevel: 11, hasFocus: true, furthest: 'done' })).toBe('consent')
      expect(resumeStep({ consented: false })).toBe('consent')
    })
  })

  describe('resumeStep for a student part-way through the older 11-step flow', () => {
    const named = { ...C, fullName: 'Juan' }
    const graded = { ...named, gradeLevel: 11 }
    const focused = { ...graded, hasFocus: true }

    it('after the old name step: about-you (the grade is still missing)', () => {
      expect(resumeStep({ ...named, furthest: 'name' })).toBe('about')
    })

    it('after the old grade or school steps: the exam', () => {
      expect(resumeStep({ ...graded, furthest: 'grade' })).toBe('goals')
      expect(resumeStep({ ...graded, furthest: 'school' })).toBe('goals')
    })

    it('after the old goal or any later scholarship step: the quick check', () => {
      for (const old of ['goals', 'courses', 'sensitive', 'income', 'gwa', 'province']) {
        expect(resumeStep({ ...focused, furthest: old })).toBe('check')
      }
    })

    it('a finished old onboarding stays finished', () => {
      expect(resumeStep({ ...focused, furthest: 'check' })).toBe('done')
      expect(resumeStep({ ...focused, furthest: 'done' })).toBe('done')
    })
  })

  describe('furthestStep (the persisted marker only moves forward)', () => {
    it('keeps the later of the saved marker and the step just completed', () => {
      expect(furthestStep('', 'consent')).toBe('consent')
      expect(furthestStep(null, 'about')).toBe('about')
      expect(furthestStep('goals', 'about')).toBe('goals')
      expect(furthestStep('about', 'goals')).toBe('goals')
      expect(furthestStep('done', 'goals')).toBe('done')
      expect(furthestStep('check', 'done')).toBe('done')
      expect(furthestStep('garbage', 'about')).toBe('about')
    })

    it('ranks an old marker by the new step it maps to, and writes new ids only', () => {
      // Old 'province' sits at the new 'goals': re-confirming the goal keeps the
      // new id (same rank), and nothing earlier moves it back.
      expect(furthestStep('province', 'goals')).toBe('goals')
      expect(furthestStep('province', 'about')).toBe('goals')
      expect(furthestStep('grade', 'consent')).toBe('about')
      expect(furthestStep('courses', 'done')).toBe('done')
    })
  })
})
