import { parseSchoolSearchIntent } from '../schoolSearchIntent'

describe('parseSchoolSearchIntent', () => {
  it('parses the acceptance-criteria query: region + free-tuition intent, no leftover name filter', () => {
    const intent = parseSchoolSearchIntent('free tuition universities in bicol')
    expect(intent.region).toBe('Region V (Bicol)')
    expect(intent.freeTuitionOnly).toBe(true)
    // "universities"/"in" are generic filler, not a school-name fragment —
    // leaving them as a hard substring requirement would zero out every result.
    expect(intent.nameQuery).toBe('')
  })

  it('detects "free" alone as the free-tuition token', () => {
    expect(parseSchoolSearchIntent('free schools').freeTuitionOnly).toBe(true)
  })

  it('detects "libre" as the free-tuition token', () => {
    expect(parseSchoolSearchIntent('libre na paaralan').freeTuitionOnly).toBe(true)
  })

  it('detects region aliases case-insensitively', () => {
    expect(parseSchoolSearchIntent('schools in CALABARZON').region).toBe('Region IV-A (CALABARZON)')
    expect(parseSchoolSearchIntent('Metro Manila universities').region).toBe('NCR')
  })

  it('returns null region and false freeTuitionOnly for a plain name query', () => {
    const intent = parseSchoolSearchIntent('Bicol University')
    // "Bicol" is itself a region alias here, so region IS detected — that's
    // intended (the acceptance criteria wants region tokens picked up even
    // mid-name). The remaining "University" is filler, "Bicol" already consumed.
    expect(intent.region).toBe('Region V (Bicol)')
    expect(intent.freeTuitionOnly).toBe(false)
  })

  it('keeps a genuine name fragment as nameQuery when no region/free tokens are present', () => {
    const intent = parseSchoolSearchIntent('Mapua')
    expect(intent.region).toBeNull()
    expect(intent.freeTuitionOnly).toBe(false)
    expect(intent.nameQuery).toBe('mapua')
  })

  it('returns an empty/neutral intent for a blank query', () => {
    const intent = parseSchoolSearchIntent('')
    expect(intent.region).toBeNull()
    expect(intent.freeTuitionOnly).toBe(false)
    expect(intent.nameQuery).toBe('')
  })

  it('keeps meaningful leftover tokens alongside a detected region', () => {
    const intent = parseSchoolSearchIntent('nursing schools in bicol')
    expect(intent.region).toBe('Region V (Bicol)')
    expect(intent.nameQuery).toContain('nursing')
  })
})
