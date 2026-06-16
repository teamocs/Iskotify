import { describe, it, expect } from 'vitest'
import {
  countryCodeFromName,
  aggregateDestinationCountries,
  type CountryInput,
  type DestinationInput,
} from '../destinations'

describe('countryCodeFromName', () => {
  it('strips parenthetical qualifiers', () => {
    expect(countryCodeFromName('Australia (Skilled)')).toBe('australia')
    expect(countryCodeFromName('Canada (PNP/EE)')).toBe('canada')
    expect(countryCodeFromName('UAE (Dubai DIFC)')).toBe('uae')
  })

  it('strips slash qualifiers', () => {
    expect(countryCodeFromName('UAE / Gulf (Agrifood)')).toBe('uae')
    expect(countryCodeFromName('UAE or Gulf')).toBe('uae-or-gulf') // no slash/paren → kept, slugified
  })

  it('slugifies multi-word names', () => {
    expect(countryCodeFromName('Saudi Arabia')).toBe('saudi-arabia')
    expect(countryCodeFromName('New Zealand')).toBe('new-zealand')
    expect(countryCodeFromName('USA')).toBe('usa')
  })

  it('handles empty / nullish input', () => {
    expect(countryCodeFromName('')).toBe('')
    // @ts-expect-error — defends against null at runtime
    expect(countryCodeFromName(null)).toBe('')
  })
})

describe('aggregateDestinationCountries', () => {
  const countries: CountryInput[] = [
    { code: 'australia', name: 'Australia', region: 'Oceania' },
    { code: 'canada', name: 'Canada', region: 'North America' },
    { code: 'uae', name: 'UAE', region: 'Gulf' },
    { code: 'chile', name: 'Chile', region: 'South America' }, // no destinations → zero
  ]

  it('collapses qualified country variants into one canonical country', () => {
    const dests: DestinationInput[] = [
      { courseId: 'A', country: 'Canada' },
      { courseId: 'B', country: 'Canada (PNP/EE)' },
      { courseId: 'C', country: 'Canada (Atlantic/BC)' },
      { courseId: 'D', country: 'Australia' },
      { courseId: 'E', country: 'Australia (Skilled)' },
    ]
    const out = aggregateDestinationCountries(countries, dests)
    const canada = out.find(c => c.code === 'canada')!
    const australia = out.find(c => c.code === 'australia')!
    // one card per country, not one per raw string
    expect(out.filter(c => c.code === 'canada')).toHaveLength(1)
    expect(canada.courseCount).toBe(3) // A, B, C
    expect(australia.courseCount).toBe(2) // D, E
  })

  it('counts DISTINCT courses (same course in two destination rows = 1)', () => {
    const dests: DestinationInput[] = [
      { courseId: 'X', country: 'UAE' },
      { courseId: 'X', country: 'UAE (Dubai DIFC)' },
      { courseId: 'Y', country: 'UAE / Gulf' },
    ]
    const uae = aggregateDestinationCountries(countries, dests).find(c => c.code === 'uae')!
    expect(uae.courseCount).toBe(2) // X (deduped), Y
  })

  it('orders by demand desc, then name; zero-count countries last', () => {
    const dests: DestinationInput[] = [
      { courseId: 'A', country: 'Canada' },
      { courseId: 'B', country: 'Canada' },
      { courseId: 'C', country: 'Australia' },
    ]
    const out = aggregateDestinationCountries(countries, dests)
    expect(out.map(c => c.code)).toEqual(['canada', 'australia', 'chile', 'uae'])
    // chile vs uae both zero → alphabetical by name (Chile before UAE)
  })

  it('ignores destinations whose country matches no known country', () => {
    const dests: DestinationInput[] = [
      { courseId: 'A', country: 'Atlantis' },
      { courseId: 'B', country: 'Canada' },
    ]
    const out = aggregateDestinationCountries(countries, dests)
    expect(out.find(c => c.code === 'canada')!.courseCount).toBe(1)
    expect(out.some(c => c.name === 'Atlantis')).toBe(false)
  })
})
