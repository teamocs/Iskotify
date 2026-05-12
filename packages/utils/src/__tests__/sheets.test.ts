import { describe, it, expect } from 'vitest'
import { transformSheetRow } from '../sheets'

const validRow: Record<string, string> = {
  type: 'scholarship',
  title: 'DOST-SEI Merit Scholarship 2026',
  slug: 'dost-sei-2026',
  provider: 'DOST',
  description: 'Science and engineering scholarship',
  requirements: 'GWA of 90%|Filipino citizen',
  coverage: 'Full tuition|Monthly stipend of PHP 7,000',
  deadline: '2026-02-28',
  exam_date: '2026-03-15',
  results_date: '2026-06-01',
  events: 'Orientation|2026-03-10|Interview|2026-04-05',
  target_courses: 'Engineering|Computer Science',
  target_year_levels: 'Grade 12|1st Year College',
  tags: 'stem|government|nationwide',
  status: 'active',
  region: 'Nationwide',
  grant_amount: '7000',
  external_url: 'https://dost.gov.ph',
  image_url: 'https://cdn.iskotify.ph/dost.png',
}

describe('transformSheetRow', () => {
  it('transforms a valid row into a ListingUpsert', () => {
    const result = transformSheetRow(validRow)
    expect(result).not.toBeNull()
    expect(result!.title).toBe('DOST-SEI Merit Scholarship 2026')
    expect(result!.slug).toBe('dost-sei-2026')
    expect(result!.type).toBe('scholarship')
    expect(result!.provider).toBe('DOST')
  })

  it('parses pipe-separated requirements into an array', () => {
    const result = transformSheetRow(validRow)
    expect(result!.requirements).toEqual(['GWA of 90%', 'Filipino citizen'])
  })

  it('parses pipe-separated tags into an array', () => {
    const result = transformSheetRow(validRow)
    expect(result!.tags).toEqual(['stem', 'government', 'nationwide'])
  })

  it('parses events column into name/date objects', () => {
    const result = transformSheetRow(validRow)
    expect(result!.events).toEqual([
      { name: 'Orientation', date: '2026-03-10' },
      { name: 'Interview', date: '2026-04-05' },
    ])
  })

  it('parses grant_amount as a number', () => {
    const result = transformSheetRow(validRow)
    expect(result!.grant_amount).toBe(7000)
  })

  it('passes through date strings as-is', () => {
    const result = transformSheetRow(validRow)
    expect(result!.deadline).toBe('2026-02-28')
    expect(result!.exam_date).toBe('2026-03-15')
    expect(result!.results_date).toBe('2026-06-01')
  })

  it('returns null when type is missing', () => {
    expect(transformSheetRow({ ...validRow, type: '' })).toBeNull()
  })

  it('returns null when type is invalid', () => {
    expect(transformSheetRow({ ...validRow, type: 'grant' })).toBeNull()
  })

  it('returns null when title is empty', () => {
    expect(transformSheetRow({ ...validRow, title: '' })).toBeNull()
  })

  it('returns null when slug is empty', () => {
    expect(transformSheetRow({ ...validRow, slug: '' })).toBeNull()
  })

  it('returns null when slug contains invalid characters', () => {
    expect(transformSheetRow({ ...validRow, slug: 'DOST SEI 2026' })).toBeNull()
  })

  it('returns empty arrays for blank array fields', () => {
    const result = transformSheetRow({ ...validRow, tags: '', target_courses: '' })
    expect(result!.tags).toEqual([])
    expect(result!.target_courses).toEqual([])
  })

  it('returns null for blank date fields', () => {
    const result = transformSheetRow({ ...validRow, exam_date: '', results_date: '' })
    expect(result!.exam_date).toBeNull()
    expect(result!.results_date).toBeNull()
  })

  it('returns null for blank grant_amount', () => {
    const result = transformSheetRow({ ...validRow, grant_amount: '' })
    expect(result!.grant_amount).toBeNull()
  })

  it('returns null for non-numeric grant_amount', () => {
    const result = transformSheetRow({ ...validRow, grant_amount: 'seven thousand' })
    expect(result!.grant_amount).toBeNull()
  })

  it('returns empty events array for blank events field', () => {
    const result = transformSheetRow({ ...validRow, events: '' })
    expect(result!.events).toEqual([])
  })

  it('sets updated_at to a current ISO timestamp', () => {
    const before = new Date().toISOString()
    const result = transformSheetRow(validRow)
    const after = new Date().toISOString()
    expect(result!.updated_at >= before).toBe(true)
    expect(result!.updated_at <= after).toBe(true)
  })

  it('defaults status to active when field is blank', () => {
    const result = transformSheetRow({ ...validRow, status: '' })
    expect(result!.status).toBe('active')
  })
})
