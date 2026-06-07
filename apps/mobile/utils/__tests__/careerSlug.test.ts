import { countryCodeFromName } from '../careerSlug'

describe('countryCodeFromName', () => {
  it('strips parenthetical qualifier: "Australia (Skilled)" → "australia"', () => {
    expect(countryCodeFromName('Australia (Skilled)')).toBe('australia')
  })

  it('strips PNP/EE qualifier and slash: "Canada (PNP/EE)" → "canada"', () => {
    expect(countryCodeFromName('Canada (PNP/EE)')).toBe('canada')
  })

  it('handles bare country: "UAE" → "uae"', () => {
    expect(countryCodeFromName('UAE')).toBe('uae')
  })

  it('handles "UK" → "uk"', () => {
    expect(countryCodeFromName('UK')).toBe('uk')
  })

  it('slugifies multi-word: "Saudi Arabia" → "saudi-arabia"', () => {
    expect(countryCodeFromName('Saudi Arabia')).toBe('saudi-arabia')
  })

  it('slugifies multi-word: "New Zealand" → "new-zealand"', () => {
    expect(countryCodeFromName('New Zealand')).toBe('new-zealand')
  })

  it('handles "United Kingdom" → "united-kingdom"', () => {
    expect(countryCodeFromName('United Kingdom')).toBe('united-kingdom')
  })

  it('returns empty string for empty input', () => {
    expect(countryCodeFromName('')).toBe('')
  })

  it('strips compound slash prefix: "USA/Philippines" → "usa"', () => {
    expect(countryCodeFromName('USA/Philippines')).toBe('usa')
  })
})
