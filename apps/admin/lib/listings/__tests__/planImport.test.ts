import { describe, it, expect, vi } from 'vitest'
import type { Listing } from '@iskotify/utils'
import { planImport, slugify, looksLikeListingHeader } from '../planImport'

describe('looksLikeListingHeader', () => {
  it('recognises a listings header row by its known column names', () => {
    expect(looksLikeListingHeader(['Title', 'Type', 'Deadline'])).toBe(true)
    expect(looksLikeListingHeader(['name', 'Provider', 'Application Deadline', 'Link'])).toBe(true)
  })

  it('does not take a banner or a data row for a header', () => {
    expect(looksLikeListingHeader(['DOST Scholarships 2026', '', ''])).toBe(false)
    expect(looksLikeListingHeader(['DOST-SEI', 'scholarship', '2026-05-01'])).toBe(false)
    expect(looksLikeListingHeader(['Deadline', 'Region'])).toBe(false) // no title column
  })
})

function baseExisting(overrides: Partial<Listing> = {}): Listing {
  return {
    id: 'id-1',
    type: 'scholarship',
    title: 'DOST-SEI Merit Scholarship',
    slug: 'dost-sei',
    provider: 'DOST',
    description: 'A scholarship',
    requirements: ['GWA of 90%'],
    coverage: 'Full tuition',
    deadline: '2026-02-28',
    exam_date: null,
    results_date: null,
    events: [],
    target_courses: ['Engineering'],
    target_year_levels: ['1st Year College'],
    tags: ['stem'],
    status: 'active',
    region: 'Nationwide',
    grant_amount: 7000,
    external_url: 'https://dost.gov.ph',
    image_url: '',
    province: null,
    city: null,
    scope: 'national',
    is_verified: false,
    income_ceiling: null,
    gwa_requirement: null,
    monthly_stipend: null,
    service_obligation_years: null,
    has_entrance_exam: false,
    application_window: null,
    scholarship_meta: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const CANONICAL_HEADERS = [
  'type', 'title', 'slug', 'provider', 'description', 'requirements', 'coverage', 'deadline',
  'exam_date', 'results_date', 'events', 'target_courses', 'target_year_levels', 'tags', 'status',
  'region', 'grant_amount', 'external_url', 'image_url',
]

function canonicalRecord(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    type: 'scholarship',
    title: 'New Scholarship',
    slug: 'new-scholarship',
    provider: 'DOST',
    description: '',
    requirements: '',
    coverage: '',
    deadline: '',
    exam_date: '',
    results_date: '',
    events: '',
    target_courses: '',
    target_year_levels: '',
    tags: '',
    status: '',
    region: 'Nationwide',
    grant_amount: '',
    external_url: '',
    image_url: '',
    ...overrides,
  }
}

describe('slugify', () => {
  it('lowercases, strips punctuation, and hyphenates', () => {
    expect(slugify('DOST-SEI Merit Scholarship 2026!')).toBe('dost-sei-merit-scholarship-2026')
  })
  it('collapses repeated separators and trims leading/trailing hyphens', () => {
    expect(slugify('  Foo   Bar -- Baz  ')).toBe('foo-bar-baz')
  })
})

describe('planImport — header aliasing', () => {
  it('maps common aliases (Name, Link, Amount, Kind) without calling AI', async () => {
    const ask = vi.fn()
    const headers = ['Name', 'Kind', 'Link', 'Amount', 'Slug', 'Region']
    const records = [{ Name: 'Grant A', Kind: 'scholarship', Link: 'https://a.example', Amount: '5000', Slug: 'grant-a', Region: 'NCR' }]
    const plan = await planImport({ headers, records }, [], { ask })
    expect(ask).not.toHaveBeenCalled()
    expect(plan.mappedByAi).toBe(false)
    expect(plan.rows).toHaveLength(1)
    expect(plan.rows[0]).toMatchObject({ slug: 'grant-a', title: 'Grant A', action: 'new' })
    expect(plan.rows[0]!.listing.external_url).toBe('https://a.example')
    expect(plan.rows[0]!.listing.grant_amount).toBe(5000)
  })

  it('normalizes header case, spacing and dashes', async () => {
    const headers = ['  TYPE ', 'Listing Title', 'Sheet-Region']
    const records = [{ '  TYPE ': 'exam', 'Listing Title': 'UPCAT', 'Sheet-Region': '' }]
    // "Listing Title" and "Sheet-Region" are not real aliases, so title comes
    // from nothing and this exercises the AI fallback path being invoked.
    const ask = vi.fn().mockResolvedValue(JSON.stringify({ columns: { title: 'Listing Title' }, choices: {} }))
    const plan = await planImport({ headers, records }, [], { ask })
    expect(plan.mappedByAi).toBe(true)
    expect(plan.rows[0]!.title).toBe('UPCAT')
  })
})

describe('planImport — AI column mapping fallback', () => {
  it('calls the injected ask function when required columns cannot be aliased, and applies its mapping', async () => {
    const headers = ['Program Name', 'Format', 'Deadline']
    const records = [{ 'Program Name': 'CHED Grant', Format: 'scholarship', Deadline: '2026-05-01' }]
    const ask = vi.fn().mockResolvedValue(
      JSON.stringify({ columns: { title: 'Program Name', type: 'Format' }, choices: {} }),
    )
    const plan = await planImport({ headers, records }, [], { ask })
    expect(ask).toHaveBeenCalledTimes(1)
    expect(plan.mappedByAi).toBe(true)
    expect(plan.columnMap.title).toBe('Program Name')
    expect(plan.columnMap.type).toBe('Format')
    expect(plan.rows).toHaveLength(1)
    expect(plan.rows[0]!.title).toBe('CHED Grant')
    expect(plan.invalid).toHaveLength(0)
  })

  it('leaves rows invalid (not crash) when the AI is unavailable and required columns are still missing', async () => {
    const headers = ['Program Name', 'Format']
    const records = [{ 'Program Name': 'CHED Grant', Format: 'scholarship' }]
    const ask = vi.fn().mockResolvedValue(null)
    const plan = await planImport({ headers, records }, [], { ask })
    expect(plan.mappedByAi).toBe(false)
    expect(plan.invalid).toHaveLength(1)
    expect(plan.rows).toHaveLength(0)
  })

  it('does not call AI when aliasing already resolved type and title', async () => {
    const ask = vi.fn()
    const plan = await planImport({ headers: CANONICAL_HEADERS, records: [canonicalRecord()] }, [], { ask })
    expect(ask).not.toHaveBeenCalled()
    expect(plan.rows).toHaveLength(1)
  })
})

describe('planImport — slug derivation', () => {
  it('derives the slug from the title when the slug column is blank', async () => {
    const plan = await planImport(
      { headers: CANONICAL_HEADERS, records: [canonicalRecord({ slug: '', title: 'Brand New Grant 2026' })] },
      [],
    )
    expect(plan.rows[0]!.slug).toBe('brand-new-grant-2026')
  })
})

describe('planImport — invalid rows', () => {
  it('collects a human-readable error with the sheet row number (header = row 1)', async () => {
    const plan = await planImport(
      { headers: CANONICAL_HEADERS, records: [canonicalRecord({ type: 'not-a-type' })] },
      [],
    )
    expect(plan.invalid).toHaveLength(1)
    expect(plan.invalid[0]!.row).toBe(2)
    expect(plan.invalid[0]!.errors.join(' ')).toMatch(/type/i)
  })

  it('numbers subsequent rows correctly', async () => {
    const plan = await planImport(
      {
        headers: CANONICAL_HEADERS,
        records: [
          canonicalRecord({ slug: 'ok-one' }),
          canonicalRecord({ type: 'bogus', slug: 'ok-two' }),
        ],
      },
      [],
    )
    expect(plan.invalid).toHaveLength(1)
    expect(plan.invalid[0]!.row).toBe(3)
  })

  it('flags a later row with a duplicate slug as invalid, citing the first row', async () => {
    const plan = await planImport(
      {
        headers: CANONICAL_HEADERS,
        records: [
          canonicalRecord({ slug: 'dup-slug', title: 'First' }),
          canonicalRecord({ slug: 'dup-slug', title: 'Second' }),
        ],
      },
      [],
    )
    expect(plan.rows).toHaveLength(1)
    expect(plan.rows[0]!.title).toBe('First')
    expect(plan.invalid).toHaveLength(1)
    expect(plan.invalid[0]!.row).toBe(3)
    expect(plan.invalid[0]!.errors[0]).toMatch(/duplicate slug, first seen on row 2/)
  })
})

describe('planImport — diffing against existing listings', () => {
  it('marks a slug not in the existing set as new', async () => {
    const plan = await planImport(
      { headers: CANONICAL_HEADERS, records: [canonicalRecord({ slug: 'brand-new' })] },
      [],
    )
    expect(plan.rows[0]!.action).toBe('new')
    expect(plan.rows[0]!.changes).toEqual([])
    expect(plan.counts).toMatchObject({ new: 1, update: 0, unchanged: 0, invalid: 0 })
  })

  it('marks a row identical to the existing listing as unchanged', async () => {
    const existing = baseExisting()
    const record = canonicalRecord({
      slug: existing.slug,
      title: existing.title,
      provider: existing.provider,
      description: existing.description,
      requirements: existing.requirements.join('|'),
      coverage: existing.coverage,
      deadline: existing.deadline ?? '',
      target_courses: existing.target_courses.join('|'),
      target_year_levels: existing.target_year_levels.join('|'),
      tags: existing.tags.join('|'),
      status: existing.status,
      region: existing.region,
      grant_amount: String(existing.grant_amount),
      external_url: existing.external_url,
      image_url: existing.image_url,
    })
    const plan = await planImport({ headers: CANONICAL_HEADERS, records: [record] }, [existing])
    expect(plan.rows[0]!.action).toBe('unchanged')
    expect(plan.rows[0]!.changes).toEqual([])
  })

  it('lists only the fields that changed, ignoring array order and date/number formatting', async () => {
    const existing = baseExisting({ tags: ['a', 'b'], grant_amount: 7000, deadline: '2026-02-28' })
    const record = canonicalRecord({
      slug: existing.slug,
      title: existing.title,
      provider: existing.provider,
      description: existing.description,
      requirements: existing.requirements.join('|'),
      coverage: existing.coverage,
      deadline: '2026-02-28', // unchanged
      target_courses: existing.target_courses.join('|'),
      target_year_levels: existing.target_year_levels.join('|'),
      tags: 'b|a', // reordered — should NOT count as a change
      status: existing.status,
      region: existing.region,
      grant_amount: '7000', // same value, different type — should NOT count as a change
      external_url: existing.external_url,
      image_url: existing.image_url,
      coverage_note: '', // ignored extra column
      provider2: 'New Provider', // ignored — not a real header
    })
    // Now actually change one field: provider.
    const changedRecord = { ...record, provider: 'A Different Provider' }
    const plan = await planImport({ headers: CANONICAL_HEADERS, records: [changedRecord] }, [existing])
    expect(plan.rows[0]!.action).toBe('update')
    expect(plan.rows[0]!.changes).toEqual(['provider'])
  })

  it('never proposes a change to scholarship-only fields (they are not sheet-owned)', async () => {
    const existing = baseExisting({ is_verified: true, income_ceiling: 100000 })
    const record = canonicalRecord({
      slug: existing.slug,
      title: existing.title,
      provider: 'A brand new provider name', // force an update action
      grant_amount: String(existing.grant_amount),
    })
    const plan = await planImport({ headers: CANONICAL_HEADERS, records: [record] }, [existing])
    expect(plan.rows[0]!.action).toBe('update')
    expect(plan.rows[0]!.changes).not.toContain('is_verified')
    expect(plan.rows[0]!.changes).not.toContain('income_ceiling')
    // The full listing shape is still returned (defaults included) — the publish
    // step is responsible for only applying sheet-owned fields on update.
    expect(plan.rows[0]!.listing).toHaveProperty('is_verified')
  })
})

describe('planImport — missing listings', () => {
  it('lists existing active/upcoming listings absent from the sheet, excluding closed ones', async () => {
    const inSheet = baseExisting({ slug: 'still-here' })
    const missingActive = baseExisting({ slug: 'gone-now', status: 'active' })
    const alreadyClosed = baseExisting({ slug: 'already-closed', status: 'closed' })
    const record = canonicalRecord({ slug: 'still-here', title: inSheet.title })
    const plan = await planImport({ headers: CANONICAL_HEADERS, records: [record] }, [inSheet, missingActive, alreadyClosed])
    expect(plan.missing).toEqual([{ slug: 'gone-now', title: missingActive.title, status: 'active' }])
  })

  it('does not list a listing whose slug appears in an invalid row as missing', async () => {
    const stillPresent = baseExisting({ slug: 'still-present' })
    const record = canonicalRecord({ slug: 'still-present', type: 'not-a-real-type' })
    const plan = await planImport({ headers: CANONICAL_HEADERS, records: [record] }, [stillPresent])
    expect(plan.invalid).toHaveLength(1)
    expect(plan.missing).toEqual([])
  })
})
