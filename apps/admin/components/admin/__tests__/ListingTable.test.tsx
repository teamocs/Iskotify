import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

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
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const mockListings = [
  { ...base, id: '1', title: 'Scholar A', type: 'scholarship' as const, status: 'active' as const, deadline: null, provider: '' },
  { ...base, id: '2', title: 'Exam B',    type: 'exam' as const,        status: 'upcoming' as const, deadline: null, provider: '' },
  { ...base, id: '3', title: 'Scholar C', type: 'scholarship' as const, status: 'closed' as const,  deadline: null, provider: '' },
]

describe('ListingTable', () => {
  it('renders all rows when filter is All', () => {
    const html = renderToStaticMarkup(
      React.createElement(ListingTable, { listings: mockListings, filter: 'All', onFilterChange: () => {} })
    )
    expect(html).toContain('Scholar A')
    expect(html).toContain('Exam B')
    expect(html).toContain('Scholar C')
  })

  it('renders only active rows when filter is Active', () => {
    const html = renderToStaticMarkup(
      React.createElement(ListingTable, { listings: mockListings, filter: 'Active', onFilterChange: () => {} })
    )
    expect(html).toContain('Scholar A')
    expect(html).not.toContain('Exam B')
    expect(html).not.toContain('Scholar C')
  })

  it('renders only scholarship rows when filter is Scholarships', () => {
    const html = renderToStaticMarkup(
      React.createElement(ListingTable, { listings: mockListings, filter: 'Scholarships', onFilterChange: () => {} })
    )
    expect(html).toContain('Scholar A')
    expect(html).not.toContain('Exam B')
    expect(html).toContain('Scholar C')
  })

  it('renders only exam rows when filter is Exams', () => {
    const html = renderToStaticMarkup(
      React.createElement(ListingTable, { listings: mockListings, filter: 'Exams', onFilterChange: () => {} })
    )
    expect(html).not.toContain('Scholar A')
    expect(html).toContain('Exam B')
    expect(html).not.toContain('Scholar C')
  })

  it('renders only upcoming rows when filter is Upcoming', () => {
    const html = renderToStaticMarkup(
      React.createElement(ListingTable, { listings: mockListings, filter: 'Upcoming', onFilterChange: () => {} })
    )
    expect(html).toContain('Exam B')
    expect(html).not.toContain('Scholar A')
    expect(html).not.toContain('Scholar C')
  })
})
