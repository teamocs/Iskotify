// iOS redesign P4: the pure rules behind the trust rule (every deadline shows
// its official source and exact date), the calm relative time, the school
// logo tile and the featured card (never invented).
import {
  fmtMonthDay, officialSourceLine, pickFeatured, relativeDay, schoolInitials, sourceHost,
} from '../exploreModel'
import {
  activeFilterCount, filterSummary, schoolRowSubtitle, splitListField, NO_SCHOOL_FILTERS,
} from '../../schools/schoolModel'

const DAY = 86_400_000
const NOW = new Date(2026, 8, 26, 12, 0, 0).getTime()

describe('sourceHost / officialSourceLine', () => {
  it('names the host of an http(s) link, without www. or a path', () => {
    expect(sourceHost('https://www.sei.dost.gov.ph/apply?x=1')).toBe('sei.dost.gov.ph')
    expect(sourceHost('http://ched.gov.ph')).toBe('ched.gov.ph')
    expect(officialSourceLine('https://www.up.edu.ph/upcat')).toBe('Official site: up.edu.ph')
  })

  it('names nothing when there is no usable link (never a guessed source)', () => {
    for (const v of [null, undefined, '', '   ', 'ched.gov.ph', 'javascript:alert(1)', 'https://localhost/x', 'ftp://x.ph']) {
      expect(sourceHost(v)).toBeNull()
      expect(officialSourceLine(v)).toBeNull()
    }
  })
})

describe('relativeDay', () => {
  it('is calm: Today, Tomorrow, "In N days", Passed', () => {
    expect(relativeDay(NOW, NOW)).toBe('Today')
    expect(relativeDay(NOW + DAY, NOW)).toBe('Tomorrow')
    expect(relativeDay(NOW + 8 * DAY, NOW)).toBe('In 8 days')
    expect(relativeDay(NOW - 2 * DAY, NOW)).toBe('Passed')
    expect(relativeDay(null, NOW)).toBeNull()
  })

  it('never uses alarm words', () => {
    for (const d of [0, 1, 2, 7, 30]) expect(relativeDay(NOW + d * DAY, NOW)).not.toMatch(/left|behind|only|hurry|!/i)
  })
})

describe('fmtMonthDay', () => {
  it('is the short month and day for the date capsule', () => {
    expect(fmtMonthDay(new Date(2026, 9, 20, 12).getTime())).toBe('Oct 20')
  })
})

describe('schoolInitials', () => {
  it('uses a short acronym whole', () => {
    expect(schoolInitials('University of the Philippines Los Baños', 'UPLB')).toBe('UPLB')
    expect(schoolInitials('Polytechnic University of the Philippines', 'pup')).toBe('PUP')
  })

  it('falls back to the initials of the main words, at most three', () => {
    expect(schoolInitials('University of the Philippines Diliman')).toBe('UPD')
    expect(schoolInitials('Ateneo de Manila University', null)).toBe('AMU')
    expect(schoolInitials('Mapúa')).toBe('M')
  })
})

describe('pickFeatured', () => {
  const l = (id: string, deadline: number | null, type = 'scholarship') => ({ id, slug: id, title: id, type, deadline })

  it('is the soonest deadline still open, of the given type', () => {
    const rows = [l('late', NOW + 20 * DAY), l('soon', NOW + 3 * DAY), l('exam', NOW + DAY, 'exam'), l('past', NOW - DAY)]
    expect(pickFeatured(rows, 'scholarship', NOW)?.id).toBe('soon')
    expect(pickFeatured(rows, 'exam', NOW)?.id).toBe('exam')
  })

  it('prefers a scholarship the student is eligible for', () => {
    const rows = [l('soon', NOW + 3 * DAY), l('mine', NOW + 9 * DAY)]
    expect(pickFeatured(rows, 'scholarship', NOW, r => (r.id === 'mine' ? 'eligible' : 'maybe'))?.id).toBe('mine')
  })

  it('is null when nothing has an open deadline: the card is never invented', () => {
    expect(pickFeatured([l('none', null), l('past', NOW - 5 * DAY)], 'scholarship', NOW)).toBeNull()
    expect(pickFeatured([], 'scholarship', NOW)).toBeNull()
  })
})

describe('schoolModel', () => {
  it('splits joined list fields and de-dupes them', () => {
    expect(splitListField('["BS Nursing, BS Biology", "bs nursing"]')).toEqual(['BS Nursing', 'BS Biology'])
    expect(splitListField('["UniFAST / RA 10931"]')).toEqual(['UniFAST / RA 10931'])
    expect(splitListField('not json')).toEqual([])
    expect(splitListField(null)).toEqual([])
  })

  it('a row subtitle is city · exam · courses, from the data only', () => {
    expect(schoolRowSubtitle({ city: 'Quezon City', entranceExamAcronym: 'UPCAT', coursesOffered: '["A, B, C"]' })).toBe('Quezon City · UPCAT · 3 courses')
    expect(schoolRowSubtitle({ province: 'Laguna', coursesOffered: '["A"]' })).toBe('Laguna · 1 course')
    expect(schoolRowSubtitle({})).toBe('')
  })

  it('counts and summarises the filters that are on', () => {
    expect(activeFilterCount(NO_SCHOOL_FILTERS)).toBe(0)
    const f = { freeTuitionOnly: true, type: 'SUC', region: 'NCR' }
    expect(activeFilterCount(f)).toBe(3)
    expect(filterSummary(f)).toBe('Free tuition · SUC · NCR')
  })
})
