import {
  exploreColumns,
  daysUntilDate,
  dateUrgency,
  matchBadge,
  SECTION_SEARCH,
} from '../exploreModel'

const DAY = 86_400_000
// Noon local time so day arithmetic never straddles midnight.
const NOW = new Date(2026, 8, 26, 12, 0, 0).getTime()

describe('exploreColumns', () => {
  it('is one column on phones, two on tablets, three on desktop', () => {
    expect(exploreColumns('compact')).toBe(1)
    expect(exploreColumns('medium')).toBe(2)
    expect(exploreColumns('expanded')).toBe(3)
  })
})

describe('daysUntilDate', () => {
  it('returns null when there is no date', () => {
    expect(daysUntilDate(null, NOW)).toBeNull()
    expect(daysUntilDate(undefined, NOW)).toBeNull()
  })

  it('counts whole calendar days ahead', () => {
    expect(daysUntilDate(NOW + 3 * DAY, NOW)).toBe(3)
    expect(daysUntilDate(NOW, NOW)).toBe(0)
  })

  it('is negative once the date has passed', () => {
    expect(daysUntilDate(NOW - 2 * DAY, NOW)).toBe(-2)
  })
})

describe('dateUrgency', () => {
  it('has nothing to say about a far-off or missing date', () => {
    expect(dateUrgency(null, NOW)).toBeNull()
    expect(dateUrgency(NOW + 90 * DAY, NOW)).toBeNull()
  })

  it('says Today / Tomorrow in the danger tone', () => {
    expect(dateUrgency(NOW, NOW)).toEqual({ label: 'Today', tone: 'danger' })
    expect(dateUrgency(NOW + DAY, NOW)).toEqual({ label: 'Tomorrow', tone: 'danger' })
  })

  it('warns within a week, and stays neutral within a month', () => {
    expect(dateUrgency(NOW + 5 * DAY, NOW)).toEqual({ label: 'In 5 days', tone: 'warning' })
    expect(dateUrgency(NOW + 20 * DAY, NOW)).toEqual({ label: 'In 20 days', tone: 'neutral' })
  })

  it('marks a passed date calmly, never in red', () => {
    expect(dateUrgency(NOW - 3 * DAY, NOW)).toEqual({ label: 'Passed', tone: 'neutral' })
  })
})

describe('matchBadge', () => {
  it('maps scholarship match statuses to a labelled tone (text carries the meaning)', () => {
    expect(matchBadge('eligible')).toEqual({ label: 'Eligible', tone: 'success' })
    expect(matchBadge('maybe')).toEqual({ label: 'Maybe eligible', tone: 'warning' })
    expect(matchBadge('ineligible')).toEqual({ label: 'Not eligible', tone: 'neutral' })
  })

  it('shows nothing when eligibility is unknown', () => {
    expect(matchBadge('unknown')).toBeNull()
  })
})

describe('SECTION_SEARCH', () => {
  it('gives every searchable section a distinct accessible name', () => {
    const names = Object.values(SECTION_SEARCH).map(s => s.label)
    expect(new Set(names).size).toBe(names.length)
    expect(SECTION_SEARCH.universities.label).toBe('Search schools and exams')
    expect(SECTION_SEARCH.scholarships.label).toBe('Search scholarships')
  })
})
