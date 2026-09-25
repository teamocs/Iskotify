import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

let search = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/listings',
  useSearchParams: () => new URLSearchParams(search),
}))

import { ListingTable } from '../ListingTable'

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
  { ...base, id: '2', title: 'Exam B',    type: 'exam' as const,        status: 'upcoming' as const, deadline: null, provider: '' },
  { ...base, id: '3', title: 'Scholar C', type: 'scholarship' as const, status: 'closed' as const,  deadline: null, provider: '' },
]

const render = (q: string) => {
  search = q
  return renderToStaticMarkup(React.createElement(ListingTable, { listings: mockListings }))
}

// Filters now live in the URL (type and status are separate facets), so the
// cases below drive the table through search params rather than a prop.
describe('ListingTable', () => {
  it('renders all rows with no filter', () => {
    const html = render('')
    expect(html).toContain('Scholar A')
    expect(html).toContain('Exam B')
    expect(html).toContain('Scholar C')
  })

  it('status=active shows only active rows', () => {
    const html = render('status=active')
    expect(html).toContain('Scholar A')
    expect(html).not.toContain('Exam B')
    expect(html).not.toContain('Scholar C')
  })

  it('type=scholarship shows only scholarships', () => {
    const html = render('type=scholarship')
    expect(html).toContain('Scholar A')
    expect(html).not.toContain('Exam B')
    expect(html).toContain('Scholar C')
  })

  it('type=exam shows only exams', () => {
    const html = render('type=exam')
    expect(html).not.toContain('Scholar A')
    expect(html).toContain('Exam B')
    expect(html).not.toContain('Scholar C')
  })

  it('status=upcoming shows only upcoming rows', () => {
    const html = render('status=upcoming')
    expect(html).toContain('Exam B')
    expect(html).not.toContain('Scholar A')
    expect(html).not.toContain('Scholar C')
  })

  it('combines type and status (active scholarships)', () => {
    const html = render('type=scholarship&status=closed')
    expect(html).toContain('Scholar C')
    expect(html).not.toContain('Scholar A')
  })

  it('searches by title', () => {
    const html = render('q=exam')
    expect(html).toContain('Exam B')
    expect(html).not.toContain('Scholar A')
  })

  it('opens a listing from a real button in the first cell and names icon actions', () => {
    const html = render('')
    expect(html).toMatch(/<tr[^>]*>\s*<t[dh][^>]*>\s*<button[^>]*type="button"[^>]*>[\s\S]*?Scholar A/)
    expect(html).toContain('aria-label="Delete Scholar A"')
    expect(html).not.toMatch(/[✏️🗑]/u)
  })

  it('writes status and type in words, never colour alone', () => {
    const html = render('')
    expect(html).toContain('Scholarship')
    expect(html).toContain('Upcoming')
  })
})
