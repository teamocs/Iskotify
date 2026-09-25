import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

let result: { data: unknown[] | null; error: { message: string } | null } = { data: [], error: null }

vi.mock('@iskotify/utils', () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        order: () => ({
          limit: async () => result,
        }),
      }),
    }),
  }),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/admin/updates',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))

import UpdatesPage from '../page'

const row = {
  id: 'u1', report_date: '2026-09-01', severity: 'info', school_slug: null, school_name: null,
  title: 'Deadline moved', body: 'b', action_required: null, event_date: null, event_type: null,
  sources: [], verified: false, updated_at: '2026-09-01T00:00:00Z',
}

describe('UpdatesPage', () => {
  beforeEach(() => { result = { data: [row], error: null } })

  it('has exactly one h1 (the Topbar title)', async () => {
    const html = renderToStaticMarkup(await UpdatesPage())
    expect(html.match(/<h1/g)?.length).toBe(1)
    expect(html).toMatch(/<h1[^>]*>\s*Admissions updates\s*<\/h1>/)
    expect(html).toContain('Deadline moved')
  })

  it('shows an ErrorBanner instead of an empty table when the query fails', async () => {
    result = { data: null, error: { message: 'boom' } }
    const html = renderToStaticMarkup(await UpdatesPage())
    expect(html).toContain('role="alert"')
    expect(html).toContain('load admissions updates')
    expect(html).not.toContain('No admissions updates yet')
  })
})
