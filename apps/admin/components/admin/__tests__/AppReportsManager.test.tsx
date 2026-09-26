import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

let search = ''
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => '/admin/app-reports',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))

import { AppReportsManager, AppReportsView, ScreenshotDialog, ScreenshotLightbox, screenshotEndpoint, type AppBugReport } from '../AppReportsManager'

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
      total={rows.length}
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

  it('shows the page the server returned as-is, with the server total', () => {
    search = 'platform=android'
    const html = view({ total: 75 })
    expect(html).toContain('Crash on open')
    expect(html).toContain('1–2 of 75')
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

describe('screenshots never load from the stored image_url', () => {
  const LEGACY = 'https://abcd.supabase.co/storage/v1/object/public/app-bug-reports/legacy.png'
  const PATH = '1727000000000-ab12cd34.png'
  const shotRows = [bug({ id: 's1', image_url: LEGACY }), bug({ id: 's2', screen: 'Home', image_url: PATH })]
  const srcs = (html: string) => [...html.matchAll(/\bsrc(?:set)?="([^"]*)"/g)].map(m => m[1] ?? '')

  it('the queue table puts no image_url in any src', () => {
    const html = view({ rows: shotRows, total: shotRows.length })
    for (const src of srcs(html)) {
      expect(src).not.toContain('legacy.png')
      expect(src).not.toContain(PATH)
    }
    expect(html).not.toContain(LEGACY)
    expect(html).not.toContain(PATH)
  })

  it('the queue shows a Screenshot button (icon + label) that opens the signed-URL lightbox', () => {
    const opened: string[] = []
    const html = view({ rows: shotRows, total: shotRows.length, onViewScreenshot: r => opened.push(r.id) })
    expect(html).toMatch(/<button[^>]*aria-label="View screenshot for Flashcards bug report"/)
    expect(html).toMatch(/<button[^>]*aria-label="View screenshot for Home bug report"[^>]*>[\s\S]*?Screenshot<\/button>/)
    expect(html).not.toMatch(/<img/)
  })

  it('the lightbox puts no image_url in any src while loading, on error, or once signed', () => {
    const SIGNED = 'https://abcd.supabase.co/storage/v1/object/sign/app-bug-reports/legacy.png?token=t'
    for (const r of shotRows) {
      const html = [
        renderToStaticMarkup(<ScreenshotLightbox report={r} onClose={noop} />),
        renderToStaticMarkup(<ScreenshotDialog report={r} state={{ status: 'loading' }} onClose={noop} />),
        renderToStaticMarkup(<ScreenshotDialog report={r} state={{ status: 'error' }} onClose={noop} />),
      ].join('')
      expect(srcs(html)).toEqual([])
      const ready = renderToStaticMarkup(<ScreenshotDialog report={r} state={{ status: 'ready', url: SIGNED }} onClose={noop} />)
      expect(srcs(ready).map(s => s.replace(/&amp;/g, '&'))).toEqual([SIGNED])
      expect(ready).not.toContain(r.image_url!)
    }
  })
})

describe('ScreenshotDialog (the lightbox view)', () => {
  const SIGNED = 'https://x.supabase.co/storage/v1/object/sign/app-bug-reports/shot.png?token=abc'

  it('is a titled, labelled dialog showing the SIGNED image, with a close button', () => {
    const html = renderToStaticMarkup(<ScreenshotDialog report={bug({})} state={{ status: 'ready', url: SIGNED }} onClose={noop} />)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    const labelledby = html.match(/aria-labelledby="([^"]+)"/)![1]
    expect(html).toMatch(new RegExp(`id="${labelledby}"[^>]*>Screenshot: Flashcards<`))
    expect(html).toMatch(/<img[^>]*alt="Screenshot of the Flashcards screen attached to this bug report"/)
    expect(html).toContain(`src="${SIGNED.replace(/&/g, '&amp;')}"`)
    expect(html).toContain('aria-label="Close"')
    expect(html).toContain('Open original')
  })

  it('shows a loading message (and no image) while the link is being signed', () => {
    const html = renderToStaticMarkup(<ScreenshotDialog report={bug({})} state={{ status: 'loading' }} onClose={noop} />)
    expect(html).toContain('Loading screenshot')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('Open original')
  })

  it('shows an alert when the link could not be signed', () => {
    const html = renderToStaticMarkup(<ScreenshotDialog report={bug({})} state={{ status: 'error' }} onClose={noop} />)
    expect(html).toContain('role="alert"')
    expect(html).not.toContain('<img')
  })
})

describe('ScreenshotLightbox (fetches a signed URL)', () => {
  it('never renders the stored image_url directly', () => {
    const html = renderToStaticMarkup(<ScreenshotLightbox report={bug({})} onClose={noop} />)
    expect(html).not.toContain('cdn.example.com')
    expect(html).toContain('Loading screenshot')
  })

  it('renders nothing without a report or without a screenshot', () => {
    expect(renderToStaticMarkup(<ScreenshotLightbox report={null} onClose={noop} />)).toBe('')
    expect(renderToStaticMarkup(<ScreenshotLightbox report={bug({ image_url: null })} onClose={noop} />)).toBe('')
  })

  it('asks the admin-only route for this report’s screenshot', () => {
    expect(screenshotEndpoint('b1')).toBe('/api/admin/app-reports/b1/screenshot')
    expect(screenshotEndpoint('a/b')).toBe('/api/admin/app-reports/a%2Fb/screenshot')
  })
})

describe('AppReportsManager page body', () => {
  it('does not repeat the page title', () => {
    const html = renderToStaticMarkup(<AppReportsManager />)
    expect(html).not.toMatch(/<h[12][^>]*>Bug reports<\/h[12]>/)
    expect(html).not.toContain('<h1')
  })
})
