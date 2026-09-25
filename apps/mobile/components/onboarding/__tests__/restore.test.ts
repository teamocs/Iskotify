import { restoreAnswers, examFocusSlug } from '../restore'

describe('restoreAnswers (rebuild onboarding answers from what each step saved)', () => {
  it('restores nothing for a fresh profile', () => {
    expect(restoreAnswers(undefined, [])).toEqual({
      selectedExams: [], selectedSlugs: [], selectedCourses: [],
      incomeBracket: null, gwaText: '', province: '',
    })
  })

  it('restores the picked exams and keeps only scholarships as listing picks', () => {
    const r = restoreAnswers({
      targetExams: JSON.stringify([
        { schoolId: 'upd', schoolName: 'UP Diliman', examAcronym: 'UPCAT' },
        { schoolId: 'xu', schoolName: 'Xavier University', examAcronym: 'XU-CET' },
      ]),
    }, ['upcat', 'school:xu', 'dost-sei', 'dost-sei'])
    expect(r.selectedExams.map(e => e.schoolId)).toEqual(['upd', 'xu'])
    expect(r.selectedExams[0]).toMatchObject({ schoolName: 'UP Diliman', examAcronym: 'UPCAT', knownForCourses: [] })
    // 'upcat' came from the UPCAT pick, 'school:xu' from Xavier: not scholarships.
    expect(r.selectedSlugs).toEqual(['dost-sei'])
  })

  it('maps an exam to the same focus slug the goal step writes', () => {
    expect(examFocusSlug({ examAcronym: 'UPCAT', schoolId: 'upd' })).toBe('upcat')
    expect(examFocusSlug({ examAcronym: 'XU-CET', schoolId: 'xu' })).toBe('school:xu')
  })

  it('restores courses, income, GWA and province', () => {
    const r = restoreAnswers({
      targetCourses: JSON.stringify([{ id: 'tax:bscs', label: 'BS Computer Science', careerCourseId: null }]),
      incomeBracket: '300k-600k', gwa: 88, province: ' Albay ',
    }, [])
    expect(r.selectedCourses).toEqual([{ id: 'tax:bscs', label: 'BS Computer Science', careerCourseId: null }])
    expect(r.incomeBracket).toBe('300k-600k')
    expect(r.gwaText).toBe('88')
    expect(r.province).toBe('Albay')
  })

  it('ignores malformed or unknown saved values instead of throwing', () => {
    const r = restoreAnswers({
      targetExams: '{not json', targetCourses: JSON.stringify([null, { id: '', label: 'x' }, 'str']),
      incomeBracket: 'lots', gwa: null, province: null,
    }, [''])
    expect(r).toEqual({
      selectedExams: [], selectedSlugs: [], selectedCourses: [],
      incomeBracket: null, gwaText: '', province: '',
    })
  })
})
