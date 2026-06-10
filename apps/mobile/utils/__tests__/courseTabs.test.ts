import { resolveCourseTabs, type CourseTabOption } from '../courseTabs'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const taxonomyRows = [
  { courseTab: 'NLE',  careerCourseId: 'HLT-002', label: 'Nursing' },
  { courseTab: 'CPA',  careerCourseId: 'BUS-001', label: 'Accountancy (CPA)' },
  { courseTab: 'CE',   careerCourseId: 'ENG-006', label: 'Civil Engineering' },
  { courseTab: 'ARCH', careerCourseId: null,       label: 'Architecture' },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveCourseTabs', () => {
  it('resolves tax: prefix directly — strips prefix and uses course.label', () => {
    const courses = [{ id: 'tax:NLE', label: 'Nursing (my label)', careerCourseId: null }]
    const result = resolveCourseTabs(courses, taxonomyRows)
    expect(result).toEqual<CourseTabOption[]>([{ courseTab: 'NLE', label: 'Nursing (my label)' }])
  })

  it('resolves via careerCourseId lookup — uses taxonomyRow.label', () => {
    const courses = [{ id: 'some-uuid', label: 'CPA Accountancy', careerCourseId: 'BUS-001' }]
    const result = resolveCourseTabs(courses, taxonomyRows)
    expect(result).toEqual<CourseTabOption[]>([{ courseTab: 'CPA', label: 'Accountancy (CPA)' }])
  })

  it('resolves via careerCourseId lookup — falls back to course.label when taxRow.label is null', () => {
    const taxWithNullLabel = [
      { courseTab: 'CE', careerCourseId: 'ENG-006', label: null },
    ]
    const courses = [{ id: 'some-uuid', label: 'Civil Eng fallback', careerCourseId: 'ENG-006' }]
    const result = resolveCourseTabs(courses, taxWithNullLabel)
    expect(result).toEqual<CourseTabOption[]>([{ courseTab: 'CE', label: 'Civil Eng fallback' }])
  })

  it('skips unresolvable courses (no careerCourseId and no tax: prefix)', () => {
    const courses = [
      { id: 'random-uuid', label: 'Unknown Course', careerCourseId: null },
    ]
    const result = resolveCourseTabs(courses, taxonomyRows)
    expect(result).toHaveLength(0)
  })

  it('skips courses whose careerCourseId has no matching taxonomy row', () => {
    const courses = [
      { id: 'some-uuid', label: 'Ghost Course', careerCourseId: 'NONEXISTENT-999' },
    ]
    const result = resolveCourseTabs(courses, taxonomyRows)
    expect(result).toHaveLength(0)
  })

  it('deduplicates by courseTab — keeps first occurrence', () => {
    const courses = [
      { id: 'tax:NLE',   label: 'Nursing first',  careerCourseId: null },
      { id: 'tax:NLE',   label: 'Nursing second', careerCourseId: null },
      { id: 'some-uuid', label: 'Nursing third',  careerCourseId: 'HLT-002' },
    ]
    const result = resolveCourseTabs(courses, taxonomyRows)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual<CourseTabOption>({ courseTab: 'NLE', label: 'Nursing first' })
  })

  it('returns empty array for empty input', () => {
    expect(resolveCourseTabs([], taxonomyRows)).toEqual([])
    expect(resolveCourseTabs([], [])).toEqual([])
  })

  it('handles multiple valid courses in order', () => {
    const courses = [
      { id: 'tax:CE',    label: 'Civil Engineering', careerCourseId: null },
      { id: 'some-uuid', label: 'Nursing',           careerCourseId: 'HLT-002' },
      { id: 'tax:CPA',   label: 'Accountancy',       careerCourseId: null },
    ]
    const result = resolveCourseTabs(courses, taxonomyRows)
    expect(result.map(r => r.courseTab)).toEqual(['CE', 'NLE', 'CPA'])
  })
})
