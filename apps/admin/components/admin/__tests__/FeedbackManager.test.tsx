import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

let search = ''
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => '/admin/feedback',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))

import { FeedbackManager, FeedbackView, type AppFeedback } from '../FeedbackManager'

const noop = () => {}
const fb = (over: Partial<AppFeedback>): AppFeedback => ({
  id: 'f1',
  user_id: null,
  rating: 4,
  message: 'Love the flashcards',
  status: 'new',
  created_at: '2026-09-03T00:00:00Z',
  updated_at: '2026-09-03T00:00:00Z',
  ...over,
})
const rows = [fb({}), fb({ id: 'f2', rating: 1, message: 'Too many ads', status: 'reviewed' })]

const view = (props: Partial<React.ComponentProps<typeof FeedbackView>> = {}) =>
  renderToStaticMarkup(
    <FeedbackView
      rows={rows}
      loading={false}
      error=""
      selected={[]}
      onSelectedChange={noop}
      bulkBusy={false}
      onBulk={noop}
      onRetry={noop}
      onSetStatus={noop}
      onDelete={noop}
      {...props}
    />,
  )

beforeEach(() => { search = '' })

describe('FeedbackView table', () => {
  it('uses human column labels', () => {
    const html = view()
    for (const h of ['Message', 'Rating', 'Status', 'Submitted']) expect(html).toContain(`>${h}<`)
    expect(html).not.toContain('created_at')
  })

  it('states the rating in text, not only stars', () => {
    expect(view()).toContain('4 of 5')
  })

  it('offers status and rating filters', () => {
    const html = view()
    expect(html).toMatch(/<label[^>]*>Status<\/label>/)
    expect(html).toMatch(/<label[^>]*>Rating<\/label>/)
  })

  it('filters by rating from the URL', () => {
    search = 'rating=1'
    const html = view()
    expect(html).toContain('Too many ads')
    expect(html).not.toContain('Love the flashcards')
  })

  it('renders an error banner instead of an empty table when loading fails', () => {
    const html = view({ rows: [], error: 'Database error' })
    expect(html).toContain('role="alert"')
    expect(html).toContain('Couldn’t load feedback')
    expect(html).not.toContain('<table')
  })

  it('shows the bulk status actions once rows are selected', () => {
    expect(view()).not.toContain('aria-label="Bulk actions"')
    const html = view({ selected: ['f1', 'f2'] })
    expect(html).toContain('2 selected')
    expect(html).toContain('Mark resolved')
  })
})

describe('FeedbackManager page body', () => {
  it('does not repeat the page title', () => {
    const html = renderToStaticMarkup(<FeedbackManager />)
    expect(html).not.toMatch(/<h[12][^>]*>Feedback<\/h[12]>/)
    expect(html).not.toContain('<h1')
  })
})
