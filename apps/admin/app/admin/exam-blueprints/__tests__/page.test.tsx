import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/admin/exam-blueprints',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/components/admin/Topbar', () => ({
  Topbar: ({ title, actions }: { title: string; actions?: React.ReactNode }) => <div data-testid="topbar">{title}{actions}</div>,
}))

let result: { data: unknown[] | null; error: { message: string } | null } = { data: [], error: null }
vi.mock('@iskotify/utils', () => ({
  createServerClient: () => ({
    from: () => ({ select: () => ({ order: () => Promise.resolve(result) }) }),
  }),
}))

import Page from '../page'

const render = async () => renderToStaticMarkup((await Page()) as React.ReactElement)
const rows = [
  { slug: 'upcat-2026', name: 'UP College Admission Test', acronym: 'UPCAT', total_items: 200, total_time_minutes: 300, status: 'published', display_order: 1 },
  { slug: 'acet', name: 'Ateneo College Entrance Test', acronym: 'ACET', total_items: 150, total_time_minutes: 180, status: 'draft', display_order: 2 },
]

beforeEach(() => { result = { data: rows, error: null } })

describe('ExamBlueprintsPage', () => {
  it('lists blueprints in a table with human column labels', async () => {
    const html = await render()
    const headers = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => (m[1] ?? '').replace(/<[^>]+>/g, '').trim())
    expect(headers).toEqual(expect.arrayContaining(['Exam', 'Acronym', 'Items', 'Time limit', 'Status']))
    expect(html).not.toMatch(/total_items|total_time_minutes|display_order/)
    expect(html).toMatch(/<caption[^>]*>Exam blueprints<\/caption>/)
  })

  it('shows status as a human badge and links each exam to its editor', async () => {
    const html = await render()
    expect(html).toContain('Published')
    expect(html).toContain('Draft')
    expect(html).toContain('href="/admin/exam-blueprints/upcat-2026"')
  })

  it('does not repeat the page title as a heading', async () => {
    const html = await render()
    expect(html).not.toMatch(/<h[12][^>]*>Exam Blueprints<\/h[12]>/)
  })

  it('shows an empty state that says how to add one', async () => {
    result = { data: [], error: null }
    expect(await render()).toContain('No exam blueprints yet')
  })

  it('shows an error banner, not an empty table, when the query fails', async () => {
    result = { data: null, error: { message: 'boom' } }
    const html = await render()
    expect(html).toContain('role="alert"')
    expect(html).toContain('boom')
    expect(html).not.toContain('No exam blueprints yet')
  })
})
