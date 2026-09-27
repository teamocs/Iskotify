import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/listings/import',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}))

import { ListingSheetImport } from '../ListingSheetImport'
import type { ImportBatch, ImportBatchSummary } from '@/lib/listings/types'

const NEW_LISTING = {
  slug: 'new-one', title: 'New One', type: 'scholarship' as const, provider: 'X', description: '', requirements: [],
  coverage: '', deadline: null, exam_date: null, results_date: null, events: [], target_courses: [],
  target_year_levels: [], tags: [], status: 'active' as const, region: 'NCR', grant_amount: null, external_url: '', image_url: '',
  province: null, city: null, scope: 'national' as const, is_verified: false, income_ceiling: null, gwa_requirement: null,
  monthly_stipend: null, service_obligation_years: null, has_entrance_exam: false, application_window: null, scholarship_meta: null,
  updated_at: '2026-01-01T00:00:00.000Z',
}

function batch(overrides: Partial<ImportBatch> = {}): ImportBatch {
  return {
    id: 'batch-1',
    sheet_id: 'sheet-1',
    sheet_url: 'https://docs.google.com/spreadsheets/d/sheet-1/edit',
    sheet_title: 'Scholarships 2026',
    tab: 'Sheet1',
    status: 'preview',
    rows: [{ slug: 'new-one', title: 'New One', action: 'new', changes: [], listing: NEW_LISTING }],
    invalid: [],
    missing: [],
    column_map: { title: 'title' },
    mapped_by_ai: false,
    new_count: 1,
    update_count: 0,
    unchanged_count: 0,
    invalid_count: 0,
    closed_count: 0,
    created_by: 'admin-1',
    created_at: '2026-01-01T00:00:00.000Z',
    published_by: null,
    published_at: null,
    discarded_at: null,
    ...overrides,
  }
}

function render(preview: ImportBatch | null, history: ImportBatchSummary[] = [], lastUrl: string | null = null, serviceAccountEmail: string | null = null) {
  return renderToStaticMarkup(
    React.createElement(ListingSheetImport, { preview, history, lastUrl, serviceAccountEmail }),
  )
}

describe('ListingSheetImport', () => {
  it('renders the source card prefilled with lastUrl when there is no preview yet', () => {
    const html = render(null, [], 'https://docs.google.com/spreadsheets/d/abc/edit')
    expect(html).toContain('Load preview')
    expect(html).toContain('https://docs.google.com/spreadsheets/d/abc/edit')
    expect(html).not.toContain('Discard')
  })

  it('shows the service account email in the sharing hint when provided', () => {
    const html = render(null, [], null, 'sync-bot@fake-project.iam.gserviceaccount.com')
    expect(html).toContain('sync-bot@fake-project.iam.gserviceaccount.com')
  })

  it('renders the preview summary badges and rows', () => {
    const html = render(batch())
    expect(html).toContain('New 1')
    expect(html).toContain('Updated 0')
    expect(html).toContain('Unchanged 0')
    expect(html).toContain('New One')
    expect(html).toContain('Publish 1 change')
  })

  it('shows an invalid rows section when the batch has invalid rows', () => {
    const html = render(batch({ invalid_count: 1, invalid: [{ row: 5, title: 'Bad Row', errors: ['type: Invalid'] }] }))
    expect(html).toContain('Invalid rows')
    expect(html).toContain('Row 5')
    expect(html).toContain('Bad Row')
  })

  it('shows a "not in this sheet" section with a close-missing checkbox', () => {
    const html = render(batch({ missing: [{ slug: 'gone', title: 'Gone Listing', status: 'active' }] }))
    expect(html).toContain('Not in this sheet')
    expect(html).toContain('Gone Listing')
    expect(html).toContain('Close these 1 listing')
    expect(html).toContain('type="checkbox"')
  })

  it('shows the "Mapped by AI" badge and its column map disclosure when mapped_by_ai is true', () => {
    const html = render(batch({ mapped_by_ai: true, column_map: { title: 'Program Name' } }))
    expect(html).toContain('Mapped by AI')
    expect(html).toContain('Program Name')
  })

  it('does not render the preview card when there is no preview batch', () => {
    const html = render(null)
    expect(html).not.toContain('Discard')
  })

  it('renders an empty state when history has no batches', () => {
    const html = render(null, [])
    expect(html).toContain('No imports yet')
  })

  it('renders history rows with a link to the sheet and an outcome badge', () => {
    const history: ImportBatchSummary[] = [{
      id: 'h1',
      sheet_id: 'sheet-1',
      sheet_url: 'https://docs.google.com/spreadsheets/d/sheet-1/edit',
      sheet_title: 'Scholarships 2026',
      tab: 'Sheet1',
      status: 'published',
      mapped_by_ai: false,
      column_map: null,
      new_count: 2,
      update_count: 1,
      unchanged_count: 3,
      invalid_count: 0,
      closed_count: 0,
      created_by: 'admin-1',
      created_at: '2026-01-01T00:00:00.000Z',
      published_by: 'admin-1',
      published_at: '2026-01-01T00:05:00.000Z',
      discarded_at: null,
    }]
    const html = render(null, history)
    expect(html).toContain('Published')
    expect(html).toContain('href="https://docs.google.com/spreadsheets/d/sheet-1/edit"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('Scholarships 2026')
  })

  it('disables Publish when there are no changes and closeMissing is off', () => {
    const html = render(batch({ new_count: 0, update_count: 0, unchanged_count: 1, rows: [{ slug: 'u', title: 'U', action: 'unchanged', changes: [], listing: NEW_LISTING }] }))
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*Publish 0 changes/)
  })
})
