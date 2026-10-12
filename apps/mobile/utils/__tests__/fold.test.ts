/**
 * Diacritic folding for search: "Dasmariñas" and "dasmarinas", "Cañete" and
 * "canete" must find each other in both directions, in Search and Explore.
 */
import { fold } from '../fold'
import { tokenize, searchListings, scoreListing, parseIntent, contentTokens } from '../listingSearch'
import { parseSchoolSearchIntent } from '../schoolSearchIntent'
import { searchCatalog, type SearchListing, type SearchSchool } from '../../components/search/searchModel'

const school = (name: string, acronym: string | null = null): SearchSchool => ({
  id: name, name, acronym, region: null, province: null, isSuc: false, isLuc: false, freeTuition: null,
})
const listing = (title: string, extra: Partial<SearchListing> = {}): SearchListing => ({
  id: title, slug: title, title, type: 'scholarship', region: null, provider: null, province: null,
  incomeCeiling: null, isVerified: null, examDate: null, deadline: null, externalUrl: null, ...extra,
})

describe('fold', () => {
  it('strips marks and lowercases', () => {
    expect(fold('Dasmariñas')).toBe('dasmarinas')
    expect(fold('CAÑETE')).toBe('canete')
    expect(fold('Pañgasinán')).toBe('pangasinan')
    expect(fold('')).toBe('')
  })

  it('keeps ñ as one letter in tokens (no split at the accent)', () => {
    expect(tokenize('Dasmariñas City')).toEqual(['dasmarinas', 'city'])
    expect(parseSchoolSearchIntent('Cañete').nameQuery).toBe('canete')
  })
})

describe('federated search folds both sides', () => {
  const data = {
    schools: [school('De La Salle University – Dasmariñas', 'DLSU-D'), school('Cañete College')],
    listings: [listing('Cañete City Scholarship'), listing('Dasmarinas Grant', { provider: 'City of Dasmariñas' })],
  }

  it.each([
    ['dasmarinas', 'De La Salle University – Dasmariñas'],
    ['Dasmariñas', 'De La Salle University – Dasmariñas'],
    ['canete', 'Cañete College'],
    ['CAÑETE', 'Cañete College'],
  ])('school query %s finds %s', (q, name) => {
    expect(searchCatalog(q, data).schools.map(s => s.name)).toContain(name)
  })

  it.each([
    ['canete', 'Cañete City Scholarship'],
    ['Cañete', 'Cañete City Scholarship'],
    ['dasmariñas', 'Dasmarinas Grant'],
    ['dasmarinas', 'Dasmarinas Grant'],
  ])('listing query %s finds %s', (q, title) => {
    expect(searchCatalog(q, data).scholarships.map(l => l.title)).toContain(title)
  })

  it('no false positives from the old split ("ca" / "ete" fragments)', () => {
    // The old tokenizer turned "ñ" into a space ("ca ete", "dasmari as"); those
    // fragments must not match a folded name.
    expect(searchCatalog('ca ete', data).schools).toHaveLength(0)
    expect(searchCatalog('dasmari as', data).schools).toHaveLength(0)
    expect(searchCatalog('canetes', data).schools).toHaveLength(0)
  })

  it('Explore listing search folds too', () => {
    const rows = [{ id: '1', slug: 'a', title: 'Cañete City Scholarship', type: 'scholarship' }]
    expect(searchListings(rows, 'canete')).toHaveLength(1)
    expect(scoreListing(rows[0]!, contentTokens('canete'), parseIntent('canete'), null)).toBeGreaterThan(0)
  })
})
