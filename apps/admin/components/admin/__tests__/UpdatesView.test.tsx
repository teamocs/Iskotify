import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/admin/updates',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))

import type { AdmissionsUpdate } from '@/app/admin/updates/page'
import { UpdatesView, UpdateDrawer, validateUpdateForm } from '../UpdatesView'

const u = (over: Partial<AdmissionsUpdate> = {}): AdmissionsUpdate => ({
  id: 'u1',
  report_date: '2026-09-01',
  severity: 'urgent',
  school_slug: 'up',
  school_name: 'University of the Philippines',
  title: 'UPCAT filing extended',
  body: 'Body text',
  action_required: null,
  event_date: '2026-10-15',
  event_type: 'application',
  sources: [],
  verified: true,
  updated_at: '2026-09-01T00:00:00Z',
  ...over,
})

const headers = (html: string) =>
  [...html.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map(m => (m[1] ?? '').replace(/<[^>]+>/g, '').trim())

describe('UpdatesView table', () => {
  it('renders on the shared DataTable with human column labels', () => {
    const html = renderToStaticMarkup(<UpdatesView updates={[u()]} />)
    expect(html).toContain('<caption')
    const h = headers(html)
    expect(h).toEqual(expect.arrayContaining(['Update', 'Severity', 'Reported', 'Event date', 'Verified', 'Actions']))
  })

  it('opens a row from a real button in its first cell, with labelled row actions', () => {
    const html = renderToStaticMarkup(<UpdatesView updates={[u()]} />)
    expect(html).toMatch(/<button type="button"[^>]*>UPCAT filing extended<\/button>/)
    expect(html).toContain('aria-label="Edit UPCAT filing extended"')
    expect(html).toContain('aria-label="Delete UPCAT filing extended"')
  })

  it('shows severity as a badge and verified as an icon, not a glyph', () => {
    const html = renderToStaticMarkup(<UpdatesView updates={[u()]} />)
    expect(html).toContain('Urgent')
    expect(html).toContain('bg-danger-soft')
    expect(html).not.toContain('✓')
    expect(html).toContain('>Verified</span>')
  })

  it('formats dates for en-PH', () => {
    const html = renderToStaticMarkup(<UpdatesView updates={[u()]} />)
    expect(html).toContain('Oct 15, 2026')
  })

  it('has no heading of its own and no raw palette classes', () => {
    const html = renderToStaticMarkup(<UpdatesView updates={[u({ severity: 'info' })]} />)
    expect(html).not.toMatch(/<h1|<h2/)
    expect(html).not.toMatch(/gray-|bg-white|\[#/)
  })

  it('explains the empty state', () => {
    const html = renderToStaticMarkup(<UpdatesView updates={[]} />)
    expect(html).toContain('No admissions updates yet')
    expect(html).toContain('New update')
  })
})

describe('UpdateDrawer form', () => {
  it('is a real form with wired labels and required markers', () => {
    const html = renderToStaticMarkup(<UpdateDrawer update={u()} onClose={vi.fn()} onRequestDelete={vi.fn()} />)
    expect(html).toMatch(/<form[^>]*novalidate/i)
    expect(html).toMatch(/<button type="submit"[^>]*>[\s\S]*Save changes<\/button>/)
    const labels = [...html.matchAll(/<label for="([^"]+)"[^>]*>([^<]*)/g)]
    const names = labels.map(l => l[2])
    for (const n of ['Severity', 'Report date', 'School slug', 'School name', 'Title', 'Body', 'Action required', 'Event date', 'Event type', 'Sources']) {
      expect(names).toContain(n)
    }
    for (const [, id] of labels) expect(html).toContain(`id="${id}"`)
    expect(html.match(/ required=""/g)?.length).toBe(4)
    expect(html).not.toMatch(/aria-label="(Title|Body|Severity)"/)
  })

  it('offers Delete only when editing', () => {
    expect(renderToStaticMarkup(<UpdateDrawer update={null} onClose={vi.fn()} onRequestDelete={vi.fn()} />)).not.toContain('>Delete<')
    expect(renderToStaticMarkup(<UpdateDrawer update={u()} onClose={vi.fn()} onRequestDelete={vi.fn()} />)).toContain('Delete')
  })
})

describe('validateUpdateForm', () => {
  it('flags each missing required field', () => {
    const e = validateUpdateForm({ report_date: '', severity: '', title: ' ', body: '' })
    expect(Object.keys(e).sort()).toEqual(['body', 'report_date', 'severity', 'title'])
  })
  it('passes a complete form', () => {
    expect(validateUpdateForm({ report_date: '2026-01-01', severity: 'info', title: 'T', body: 'B' })).toEqual({})
  })
})
