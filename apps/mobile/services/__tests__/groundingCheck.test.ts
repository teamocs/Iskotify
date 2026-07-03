import { extractClaims, verifyGrounding } from '../groundingCheck'

describe('extractClaims', () => {
  it('extracts URLs', () => {
    const { urls } = extractClaims('See https://iskotify.ph/upcat and http://example.com/x)')
    expect(urls).toEqual(['https://iskotify.ph/upcat', 'http://example.com/x'])
  })

  it('extracts 19xx/20xx years only', () => {
    const { years } = extractClaims('The UPCAT is in 2026, not 1899 or 3000.')
    expect(years).toEqual(['2026'])
  })

  it('extracts currency-tagged amounts (₱/php/p prefix)', () => {
    const { amounts } = extractClaims('The grant is ₱50,000 or PHP 20000 per year.')
    expect(amounts).toContain('₱50,000')
    expect(amounts.some(a => /20000/.test(a))).toBe(true)
  })

  it('extracts suffix-tagged amounts (N pesos / N php)', () => {
    const { amounts } = extractClaims('You get 5000 pesos monthly.')
    expect(amounts.some(a => /5000/.test(a))).toBe(true)
  })

  it('does NOT treat a bare small number as a claim (advice like "30 minutes")', () => {
    const claims = extractClaims('Try to focus 30 minutes a day and keep a 5-day streak.')
    expect(claims.years).toEqual([])
    expect(claims.amounts).toEqual([])
    expect(claims.urls).toEqual([])
  })
})

describe('verifyGrounding', () => {
  it('grounded when the answer year/URL/amount all appear in context', () => {
    const answer = 'The UPCAT deadline is 2026. Apply at https://upcat.ph for the ₱50,000 grant.'
    const context = '[LISTINGS]\n- UPCAT: deadline 2026, portal https://upcat.ph, award ₱50,000'
    const result = verifyGrounding(answer, context)
    expect(result.grounded).toBe(true)
    expect(result.unsupported).toEqual([])
  })

  it('NOT grounded when the answer states a year absent from context', () => {
    const answer = 'The UPCAT deadline is in 2025.'
    const context = '[LISTINGS]\n- UPCAT: deadline is 2026'
    const result = verifyGrounding(answer, context)
    expect(result.grounded).toBe(false)
    expect(result.unsupported).toContain('2025')
  })

  it('NOT grounded when the answer states a URL absent from context', () => {
    const answer = 'Apply at https://fake-site.example/apply now.'
    const context = 'The official portal is https://iskotify.ph/lists'
    const result = verifyGrounding(answer, context)
    expect(result.grounded).toBe(false)
    expect(result.unsupported).toContain('https://fake-site.example/apply')
  })

  it('NOT grounded when the answer states a peso amount absent from context', () => {
    const answer = 'The scholarship is worth ₱90,000 per year.'
    const context = 'The scholarship award is ₱50,000 per year.'
    const result = verifyGrounding(answer, context)
    expect(result.grounded).toBe(false)
    expect(result.unsupported.some(u => /90,000/.test(u))).toBe(true)
  })

  it('grounded=true for an answer with no dates/amounts/URLs', () => {
    const result = verifyGrounding('Photosynthesis is how plants make food from sunlight.', '')
    expect(result.grounded).toBe(true)
    expect(result.unsupported).toEqual([])
  })

  it('normalizes amount digits — "₱50,000" grounded by context "50000"', () => {
    expect(verifyGrounding('It costs ₱50,000.', 'award 50000').grounded).toBe(true)
  })

  it('normalizes amount digits — "₱50,000" grounded by context "50,000"', () => {
    expect(verifyGrounding('It costs ₱50,000.', 'award 50,000').grounded).toBe(true)
  })

  it('matches URLs case-insensitively', () => {
    const answer = 'Visit https://Iskotify.PH/Lists'
    const context = 'portal: https://iskotify.ph/lists'
    expect(verifyGrounding(answer, context).grounded).toBe(true)
  })

  it('does not flag a bare number in advice as a claim', () => {
    // "focus 30 minutes" has no currency tag and 30 is not a year → not a claim.
    expect(verifyGrounding('Try to focus 30 minutes a day.', '').grounded).toBe(true)
  })
})
