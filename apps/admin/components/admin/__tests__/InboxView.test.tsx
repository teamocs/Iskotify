import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('a', { href, ...rest }, children),
}))

import { InboxView } from '../InboxView'
import type { InboxCounts } from '@/lib/admin/inboxCounts'

const now = new Date('2026-09-26T12:00:00Z').getTime()

const counts: InboxCounts = {
  drafts: { ok: true, count: 4 },
  reviewQueue: { ok: true, count: 12 },
  reports: { ok: true, count: 7 },
  bugReports: { ok: false },
  feedback: { ok: true, count: 0 },
  dateCorrections: { ok: true, count: 3 },
  driveNeedsMapping: { ok: true, count: 1 },
  driveMissingFigures: { ok: true, count: 2 },
  lastSync: { ok: true, status: 'error', at: '2026-09-26T11:00:00Z', message: 'Sheet not found' },
}

const render = (c: InboxCounts = counts) => renderToStaticMarkup(<InboxView counts={c} now={now} />)

describe('InboxView', () => {
  it('leads with a one-line summary of open work', () => {
    expect(render()).toMatch(/29 items waiting in 6 queues/)
  })

  it('links every queue to where the work is done', () => {
    const html = render()
    for (const href of ['/admin/flashcards/drafts', '/admin/upcat/review-queue', '/admin/reports', '/admin/app-reports', '/admin/feedback', '/admin/date-contributions', '/admin/sync#drive-question-bank']) {
      expect(html).toContain(`href="${href}"`)
    }
  })

  it('shows each count next to its queue name', () => {
    const html = render()
    expect(html).toMatch(/>7<[\s\S]*?Reported questions|Reported questions[\s\S]*?>7</)
    expect(html).toContain('Drafts awaiting publish')
  })

  it('says "Clear" in words for an empty queue', () => {
    expect(render()).toMatch(/Feedback[\s\S]*?Clear/)
  })

  it('says a count could not load instead of pretending it is zero', () => {
    const html = render()
    expect(html).toContain('Unavailable')
    expect(html).toContain('1 count couldn’t load')
  })

  it('reports the last listings sync with its status in words', () => {
    const html = render()
    expect(html).toContain('Failed')
    expect(html).toContain('1h ago')
    expect(html).toContain('Sheet not found')
  })

  it('celebrates quietly when everything is clear', () => {
    const zero = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, k === 'lastSync' ? v : { ok: true, count: 0 }])) as unknown as InboxCounts
    expect(render(zero)).toContain('Nothing is waiting')
  })

  it('groups queues under real headings', () => {
    const html = render()
    expect(html).toMatch(/<h2[^>]*>Content<\/h2>/)
    expect(html).toMatch(/<h2[^>]*>Inbox<\/h2>/)
  })

  it('offers the keyboard shortcuts reference', () => {
    expect(render()).toContain('<kbd')
  })
})
