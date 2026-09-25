import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

let search = ''
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => '/admin/app-reports',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))

import { AppReportsManager, AppReportsView, ScreenshotLightbox, type AppBugReport } from '../AppReportsManager'

const noop = () => {}
const bug = (over: Partial<AppBugReport>): AppBugReport => ({
  id: 'b1',
  user_id: null,
  screen: 'Flashcards',
  description: 'The flip animation freezes',
  image_url: 'https://cdn.example.com/shot.png',
  app_version: '1.4.0',
  platform: 'android',
  status: 'new',
  created_at: '2026-09-02T00:00:00Z',
  updated_at: '2026-09-02T00:00:00Z',
  ...over,
})
const rows = [bug({}), bug({ id: 'b2', screen: 'Home', description: 'Crash on open', image_url: null, platform: 'ios', status: 'resolved' })]

const view = (props: Partial<React.ComponentProps<typeof AppReportsView>> = {}) =>
  renderToStaticMarkup(
    <AppReportsView
      rows={rows}
      loading={false}
      error=""
      selected={[]}
      onSelectedChange={noop}
      bulkBusy={false}
      onBulk={noop}
      onRetry={noop}
      onViewScreenshot={noop}
      onSetStatus={noop}
      onDelete={noop}
      {...props}
    />,
  )

beforeEach(() => { search = '' })

describe('AppReportsView table', () => {
  it('uses human column labels', () => {
    const html = view()
    for (const h of ['Screen', 'Description', 'Screenshot', 'Device', 'Status', 'Reported']) expect(html).toContain(`>${h}<`)
    expect(html).not.toContain('image_url')
    expect(html).not.toContain('created_at')
  })

  it('labels the screenshot thumbnail button by what it opens', () => {
    const html = view()
    expect(html).toContain('aria-label="View screenshot for Flashcards bug report"')
  })

  it('offers status and platform filters', () => {
    const html = view()
    expect(html).toMatch(/<label[^>]*>Status<\/label>/)
    expect(html).toMatch(/<label[^>]*>Platform<\/label>/)
  })

  it('renders an error banner instead of an empty table when loading fails', () => {
    const html = view({ rows: [], error: 'Network error' })
    expect(html).toContain('role="alert"')
    expect(html).toContain('Couldn’t load bug reports')
    expect(html).not.toContain('<table')
  })

  it('shows the bulk status actions once rows are selected', () => {
    expect(view()).not.toContain('aria-label="Bulk actions"')
    const html = view({ selected: ['b1'] })
    expect(html).toContain('1 selected')
    expect(html).toContain('Mark resolved')
    expect(html).toContain('Mark reviewed')
  })
})

describe('ScreenshotLightbox', () => {
  it('is a titled, labelled dialog with a meaningful image and a close button', () => {
    const html = renderToStaticMarkup(<ScreenshotLightbox report={bug({})} onClose={noop} />)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    const labelledby = html.match(/aria-labelledby="([^"]+)"/)![1]
    expect(html).toMatch(new RegExp(`id="${labelledby}"[^>]*>Screenshot: Flashcards<`))
    expect(html).toMatch(/<img[^>]*alt="Screenshot of the Flashcards screen attached to this bug report"/)
    expect(html).toContain('aria-label="Close"')
    expect(html).toContain('Open original')
  })

  it('renders nothing without a report', () => {
    expect(renderToStaticMarkup(<ScreenshotLightbox report={null} onClose={noop} />)).toBe('')
  })
})

describe('AppReportsManager page body', () => {
  it('does not repeat the page title', () => {
    const html = renderToStaticMarkup(<AppReportsManager />)
    expect(html).not.toMatch(/<h[12][^>]*>Bug reports<\/h[12]>/)
    expect(html).not.toContain('<h1')
  })
})
