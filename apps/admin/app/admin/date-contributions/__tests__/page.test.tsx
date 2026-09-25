import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/admin/Topbar', () => ({
  Topbar: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

let search = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/date-contributions',
  useSearchParams: () => new URLSearchParams(search),
}))

type Result = { data: unknown[] | null; error: { message: string } | null }
let contribResult: Result

/** A query builder whose every method chains and which resolves to `result`. */
function chain(result: Result): Record<string, unknown> {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'limit', 'in']) c[m] = () => c
  c.then = (res: (v: Result) => unknown) => Promise.resolve(result).then(res)
  return c
}

vi.mock('@iskotify/utils', () => ({
  createServerClient: () => ({
    from: (table: string) =>
      table === 'listings'
        ? chain({ data: [{ slug: 'upcat-2027', title: 'UPCAT 2027' }], error: null })
        : chain(contribResult),
  }),
}))

const rows = [
  { id: 'c1', listing_slug: 'upcat-2027', field: 'exam_date', suggested_date: '2026-08-09', note: 'From UP site', source_url: 'https://up.edu.ph', status: 'pending', created_at: '2026-06-01T00:00:00Z' },
  { id: 'c2', listing_slug: 'dost-sei', field: 'deadline', suggested_date: '2026-09-01', note: null, source_url: null, status: 'rejected', created_at: '2026-05-01T00:00:00Z' },
]

async function render(q = '') {
  search = q
  const { default: Page } = await import('../page')
  return renderToStaticMarkup((await Page()) as React.ReactElement)
}

describe('DateContributionsPage', () => {
  beforeEach(() => { contribResult = { data: rows, error: null } })

  it('has one h1 and a table with human labels', async () => {
    const html = await render()
    expect((html.match(/<h1/g) ?? []).length).toBe(1)
    expect(html).not.toContain('User-submitted date corrections</h2>')
    expect(html).toContain('<caption')
    for (const h of ['Listing', 'Date type', 'Suggested date', 'Note', 'Source', 'Status', 'Submitted']) {
      expect(html).toContain(`>${h}<`)
    }
    expect(html).toContain('UPCAT 2027')
    expect(html).toContain('Exam date')
  })

  it('filters by status from the URL', async () => {
    expect(await render()).toMatch(/<label[^>]*>Status</)
    const rejected = await render('status=rejected')
    expect(rejected).toContain('dost-sei')
    expect(rejected).not.toContain('UPCAT 2027')
  })

  it('offers labelled Approve and Reject buttons only on pending rows', async () => {
    const html = await render()
    expect(html).toContain('aria-label="Approve date correction for UPCAT 2027"')
    expect(html).toContain('aria-label="Reject date correction for UPCAT 2027"')
    expect(html).not.toContain('date correction for dost-sei"')
  })

  it('explains the empty queue', async () => {
    contribResult = { data: [], error: null }
    const html = await render()
    expect(html).toContain('No date corrections yet')
  })

  it('shows an error banner instead of an empty table when the query fails', async () => {
    contribResult = { data: null, error: { message: 'column does not exist' } }
    const html = await render()
    expect(html).toContain('role="alert"')
    expect(html).toContain('column does not exist')
    expect(html).not.toContain('<caption')
  })
})
