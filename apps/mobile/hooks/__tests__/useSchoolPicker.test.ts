import { deriveProvinces, deriveCities, deriveSchoolNames } from '../useSchoolPicker'
import type { SchoolEntry } from '../useSchoolPicker'

const SCHOOLS: SchoolEntry[] = [
  { region: 'NCR', province: 'Metro Manila', city: 'Makati City', name: 'Makati High School' },
  { region: 'NCR', province: 'Metro Manila', city: 'Makati City', name: 'Makati Science High School' },
  { region: 'NCR', province: 'Metro Manila', city: 'Manila', name: 'Manila Science High School' },
  { region: 'Region I - Ilocos Region', province: 'Ilocos Norte', city: 'Laoag City', name: 'Laoag National High School' },
]

describe('deriveProvinces', () => {
  it('returns sorted unique provinces for a region', () => {
    expect(deriveProvinces(SCHOOLS, 'NCR')).toEqual(['Metro Manila'])
  })

  it('returns provinces sorted alphabetically when multiple', () => {
    const data: SchoolEntry[] = [
      { region: 'NCR', province: 'Taguig', city: 'Taguig', name: 'Sch A' },
      { region: 'NCR', province: 'Pasay', city: 'Pasay', name: 'Sch B' },
    ]
    expect(deriveProvinces(data, 'NCR')).toEqual(['Pasay', 'Taguig'])
  })

  it('returns empty array for unknown region', () => {
    expect(deriveProvinces(SCHOOLS, 'Unknown')).toEqual([])
  })
})

describe('deriveCities', () => {
  it('returns sorted unique cities for region + province', () => {
    expect(deriveCities(SCHOOLS, 'NCR', 'Metro Manila')).toEqual(['Makati City', 'Manila'])
  })

  it('returns empty for unknown province', () => {
    expect(deriveCities(SCHOOLS, 'NCR', 'Unknown Province')).toEqual([])
  })
})

describe('deriveSchoolNames', () => {
  it('returns sorted school names for region + province + city', () => {
    expect(deriveSchoolNames(SCHOOLS, 'NCR', 'Metro Manila', 'Makati City'))
      .toEqual(['Makati High School', 'Makati Science High School'])
  })

  it('returns empty for unknown city', () => {
    expect(deriveSchoolNames(SCHOOLS, 'NCR', 'Metro Manila', 'Unknown City')).toEqual([])
  })

  it('does not include schools from a different city', () => {
    const result = deriveSchoolNames(SCHOOLS, 'NCR', 'Metro Manila', 'Makati City')
    expect(result).not.toContain('Manila Science High School')
  })
})
