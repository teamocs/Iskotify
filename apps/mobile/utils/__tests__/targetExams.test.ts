import {
  buildExamCatalog, orderExams, searchExams, examAcronymToListingSlug,
  isRealExamAcronym, recommendCourses, allCourseOptions,
  type UniversityProfileRow, type TertiarySchoolRow,
} from '../targetExams'

const schools: TertiarySchoolRow[] = [
  { id: 'up-diliman', name: 'University of the Philippines Diliman', acronym: 'UPD', region: 'NCR', province: 'Metro Manila', rankInProvince: 1 },
  { id: 'adnu', name: 'Ateneo de Naga University', acronym: 'AdNU', region: 'Region V (Bicol)', province: 'Camarines Sur', rankInProvince: 1 },
  { id: 'bicol-u', name: 'Bicol University', acronym: 'BU', region: 'Bicol', province: 'Albay', rankInProvince: 2 },
  { id: 'no-exam-u', name: 'No Exam University', acronym: 'NEU', region: 'Region III (Central Luzon)', province: 'Bulacan', rankInProvince: 3 },
]

const profiles: UniversityProfileRow[] = [
  { schoolId: 'up-diliman', dataTier: 'FULL_PROFILE', entranceExamAcronym: 'UPCAT', entranceExamName: 'UP College Admission Test', examMonth: 'September', knownForCourses: ['Civil Engineering', 'Accountancy'], prcTopCourses: ['Nursing'] },
  { schoolId: 'adnu', dataTier: 'PROVINCE_EXPANSION', entranceExamAcronym: 'ADNU-CEA', entranceExamName: 'AdNU College Entrance Assessment', examMonth: 'November', knownForCourses: ['Nursing'], prcTopCourses: [] },
  { schoolId: 'bicol-u', dataTier: 'PROVINCE_EXPANSION', entranceExamAcronym: 'BUCET', entranceExamName: 'Bicol University College Entrance Test', examMonth: 'October', knownForCourses: [], prcTopCourses: [] },
  { schoolId: 'no-exam-u', dataTier: 'PROVINCE_EXPANSION', entranceExamAcronym: 'N/A (no separate entrance test)', entranceExamName: null, examMonth: null, knownForCourses: [], prcTopCourses: [] },
]

describe('isRealExamAcronym', () => {
  it('rejects sentinels and N/A notes', () => {
    expect(isRealExamAcronym('UPCAT')).toBe(true)
    expect(isRealExamAcronym('N/A (no separate entrance test)')).toBe(false)
    expect(isRealExamAcronym('')).toBe(false)
    expect(isRealExamAcronym('none')).toBe(false)
  })
})

describe('buildExamCatalog', () => {
  it('produces one option per school with a real exam, skipping N/A', () => {
    const cat = buildExamCatalog(profiles, schools)
    expect(cat.map(o => o.schoolId).sort()).toEqual(['adnu', 'bicol-u', 'up-diliman'])
    const upd = cat.find(o => o.schoolId === 'up-diliman')!
    expect(upd.national).toBe(true) // FULL_PROFILE and NCR
    expect(upd.region).toBe('NCR')
  })
})

describe('orderExams', () => {
  it('orders national first, then user region, then the rest', () => {
    const cat = buildExamCatalog(profiles, schools)
    const ordered = orderExams(cat, 'Bicol') // user is from Bicol
    expect(ordered[0]!.schoolId).toBe('up-diliman') // national
    // AdNU (rank 1) and Bicol U (rank 2) are both Bicol → regional, AdNU first by rank
    expect(ordered[1]!.schoolId).toBe('adnu')
    expect(ordered[2]!.schoolId).toBe('bicol-u')
  })
})

describe('searchExams', () => {
  it('matches by school name, acronym, and exam acronym', () => {
    const cat = buildExamCatalog(profiles, schools)
    expect(searchExams(cat, 'naga').map(o => o.schoolId)).toEqual(['adnu'])
    expect(searchExams(cat, 'bucet').map(o => o.schoolId)).toEqual(['bicol-u'])
    expect(searchExams(cat, 'upd').map(o => o.schoolId)).toEqual(['up-diliman'])
  })
})

describe('examAcronymToListingSlug', () => {
  it('maps known acronyms (incl. messy variants) to listing slugs', () => {
    expect(examAcronymToListingSlug('UPCAT')).toBe('upcat')
    expect(examAcronymToListingSlug('SASE (MSU System-wide)')).toBe('msu-sase')
    expect(examAcronymToListingSlug('ADNU-CEA')).toBe('adnu-cea')
    expect(examAcronymToListingSlug('Some Unknown Test')).toBeNull()
  })
})

describe('recommendCourses', () => {
  const taxonomy = [
    { courseTab: 'CE', careerCourseId: 'ENG-006', label: 'Civil Engineering' },
    { courseTab: 'NLE', careerCourseId: 'HLT-002', label: 'Nursing' },
    { courseTab: 'CPA', careerCourseId: 'BUS-001', label: 'Accountancy (CPA)' },
  ]
  const careerCourses = [{ courseId: 'ENG-006', name: 'Civil Engineering' }, { courseId: 'HLT-002', name: 'Nursing' }]

  it('recommends courses fuzzy-matched from the selected exams universities', () => {
    const cat = buildExamCatalog(profiles, schools)
    const upd = cat.filter(o => o.schoolId === 'up-diliman')
    const recs = recommendCourses(upd, taxonomy, careerCourses).map(c => c.label)
    expect(recs).toContain('Civil Engineering')
    expect(recs).toContain('Nursing')
    expect(recs).toContain('Accountancy (CPA)')
  })

  it('allCourseOptions returns a deduped sorted list', () => {
    const all = allCourseOptions(taxonomy, careerCourses)
    expect(all.length).toBe(3) // Civil Engineering, Nursing dedup across taxonomy+career; + Accountancy
    expect(all[0]!.label.localeCompare(all[1]!.label)).toBeLessThan(0)
  })
})
