import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ListingsView } from '../ListingsView'

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/listings',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}))

const base = {
  slug: 'test-slug',
  description: '',
  requirements: [],
  coverage: '',
  exam_date: null,
  results_date: null,
  events: [],
  target_courses: [],
  target_year_levels: [],
  tags: [],
  region: '',
  grant_amount: null,
  external_url: '',
  image_url: '',
  // Epic B scholarship typed fields
  province: null,
  city: null,
  scope: 'national' as const,
  is_verified: false,
  income_ceiling: null,
  gwa_requirement: null,
  monthly_stipend: null,
  service_obligation_years: null,
  has_entrance_exam: false,
  application_window: null,
  scholarship_meta: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const mockListings = [
  { ...base, id: '1', title: 'Scholar A', type: 'scholarship' as const, status: 'active' as const, deadline: null, provider: '' },
]

describe('ListingsView', () => {
  // The four stat cards became one summary strip whose counts are links that
  // set the status filter in the URL.
  it('summarises totals as filter links', () => {
    const html = renderToStaticMarkup(
      React.createElement(ListingsView, {
        listings: mockListings,
        total: 42,
        active: 10,
        upcoming: 5,
        lastImport: '2025-01-01T12:00:00Z',
      })
    )
    expect(html).toContain('Total')
    expect(html).toContain('42')
    expect(html).toContain('href="?status=active"')
    expect(html).toContain('href="?status=upcoming"')
    expect(html).toContain('Last import')
    expect(html).toContain('href="/admin/listings/import"')
  })

  it('shows "Never imported" when no batch has ever been published', () => {
    const html = renderToStaticMarkup(
      React.createElement(ListingsView, {
        listings: mockListings,
        total: 1,
        active: 1,
        upcoming: 0,
        lastImport: null,
      })
    )
    expect(html).toContain('Never imported')
  })

  it('renders the listing table', () => {
    const html = renderToStaticMarkup(
      React.createElement(ListingsView, {
        listings: mockListings,
        total: 1,
        active: 1,
        upcoming: 0,
        lastImport: null,
      })
    )
    expect(html).toContain('Scholar A')
    expect(html).not.toMatch(/text-\[#|text-gray-/)
  })
})
