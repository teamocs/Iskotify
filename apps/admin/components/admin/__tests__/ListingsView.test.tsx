import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ListingsView } from '../ListingsView'

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/listings',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
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
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const mockListings = [
  { ...base, id: '1', title: 'Scholar A', type: 'scholarship' as const, status: 'active' as const, deadline: null, provider: '' },
]

const mockLogs = [
  { id: 1, synced: 5, skipped: 2, closed: 0, status: 'ok' as const, message: null, created_at: '2025-01-01T12:00:00Z' },
]

describe('ListingsView', () => {
  it('renders all four stat cards', () => {
    const html = renderToStaticMarkup(
      React.createElement(ListingsView, {
        listings: mockListings,
        logs: mockLogs,
        total: 42,
        active: 10,
        upcoming: 5,
        lastSync: '2025-01-01T12:00:00Z',
        health: { label: 'Synced OK', accent: 'text-green-700' },
      })
    )
    expect(html).toContain('Total Listings')
    expect(html).toContain('Active')
    expect(html).toContain('Upcoming')
    expect(html).toContain('Last Sync')
    expect(html).toContain('42')
    expect(html).toContain('10')
    expect(html).toContain('5')
  })

  it('renders the listing table', () => {
    const html = renderToStaticMarkup(
      React.createElement(ListingsView, {
        listings: mockListings,
        logs: [],
        total: 1,
        active: 1,
        upcoming: 0,
        lastSync: null,
        health: { label: 'No syncs yet', accent: 'text-[#6e6e73]' },
      })
    )
    expect(html).toContain('Scholar A')
  })
})
