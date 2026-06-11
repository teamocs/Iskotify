import { aggregateDestinationCountries } from '../destinationCountries'

const COUNTRIES = [
  { code: 'australia', name: 'Australia', region: 'Oceania' },
  { code: 'canada', name: 'Canada', region: 'North America' },
  { code: 'uae', name: 'UAE', region: 'Middle East' },
  { code: 'saudi-arabia', name: 'Saudi Arabia', region: 'Middle East' },
  { code: 'uk', name: 'United Kingdom', region: 'Europe' },
]

describe('aggregateDestinationCountries', () => {
  it('returns empty array when both inputs are empty', () => {
    expect(aggregateDestinationCountries([], [])).toEqual([])
  })

  it('returns countries with courseCount 0 when no destinations', () => {
    const result = aggregateDestinationCountries(COUNTRIES, [])
    expect(result.every(c => c.courseCount === 0)).toBe(true)
    expect(result).toHaveLength(5)
  })

  it('counts DISTINCT courseIds per country', () => {
    const destinations = [
      { courseId: 'nursing', country: 'Australia (Skilled)' },
      { courseId: 'nursing', country: 'Australia (Skilled)' }, // duplicate — still 1
      { courseId: 'engineering', country: 'Australia (Skilled)' },
    ]
    const result = aggregateDestinationCountries(COUNTRIES, destinations)
    const aus = result.find(c => c.code === 'australia')
    expect(aus?.courseCount).toBe(2)
  })

  it('matches via countryCodeFromName (strips qualifiers)', () => {
    const destinations = [
      { courseId: 'nursing', country: 'Canada (PNP/EE)' },
      { courseId: 'medicine', country: 'Canada (PNP/EE)' },
    ]
    const result = aggregateDestinationCountries(COUNTRIES, destinations)
    const can = result.find(c => c.code === 'canada')
    expect(can?.courseCount).toBe(2)
  })

  it('ignores destination entries whose country does not match any country code', () => {
    const destinations = [
      { courseId: 'nursing', country: 'Mars' },
    ]
    const result = aggregateDestinationCountries(COUNTRIES, destinations)
    expect(result.every(c => c.courseCount === 0)).toBe(true)
  })

  it('orders by courseCount desc, then name asc (among non-zero)', () => {
    const destinations = [
      { courseId: 'nursing', country: 'Canada (PNP/EE)' },
      { courseId: 'engineering', country: 'Canada (PNP/EE)' },
      { courseId: 'it', country: 'Canada (PNP/EE)' },
      { courseId: 'nursing', country: 'Australia (Skilled)' },
      { courseId: 'engineering', country: 'Australia (Skilled)' },
      { courseId: 'nursing', country: 'UAE' },
    ]
    const result = aggregateDestinationCountries(COUNTRIES, destinations)
    const nonZero = result.filter(c => c.courseCount > 0)
    expect(nonZero[0]?.code).toBe('canada')   // count=3
    expect(nonZero[1]?.code).toBe('australia') // count=2
    expect(nonZero[2]?.code).toBe('uae')       // count=1
  })

  it('places zero-count countries LAST (still listed), sorted by name asc within zeros', () => {
    const destinations = [
      { courseId: 'nursing', country: 'Australia (Skilled)' },
    ]
    const result = aggregateDestinationCountries(COUNTRIES, destinations)
    const last = result[result.length - 1]
    expect(result[0]?.code).toBe('australia')  // only non-zero
    // All remaining should be zero-count and sorted by name asc
    const zeros = result.filter(c => c.courseCount === 0)
    for (let i = 1; i < zeros.length; i++) {
      expect(zeros[i - 1]!.name.localeCompare(zeros[i]!.name)).toBeLessThanOrEqual(0)
    }
    expect(last?.courseCount).toBe(0)
  })

  it('name-asc ordering within same courseCount', () => {
    const destinations = [
      { courseId: 'nursing', country: 'Australia (Skilled)' },
      { courseId: 'nursing', country: 'Canada (PNP/EE)' },
    ]
    const result = aggregateDestinationCountries(COUNTRIES, destinations)
    const nonZero = result.filter(c => c.courseCount > 0)
    // Both have count=1; Australia sorts before Canada alphabetically
    expect(nonZero[0]?.code).toBe('australia')
    expect(nonZero[1]?.code).toBe('canada')
  })

  it('preserves all country fields in output', () => {
    const result = aggregateDestinationCountries(
      [{ code: 'uae', name: 'UAE', region: 'Middle East' }],
      [],
    )
    expect(result[0]).toEqual({ code: 'uae', name: 'UAE', region: 'Middle East', courseCount: 0 })
  })

  it('handles multi-word country names via hyphenation (Saudi Arabia)', () => {
    const destinations = [
      { courseId: 'nursing', country: 'Saudi Arabia' },
    ]
    const result = aggregateDestinationCountries(COUNTRIES, destinations)
    const sa = result.find(c => c.code === 'saudi-arabia')
    expect(sa?.courseCount).toBe(1)
  })
})
