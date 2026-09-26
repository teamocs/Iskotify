import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

let search = ''
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => '/admin/things',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))

import { DataTable, type Column, type FilterDef } from '../DataTable'

interface Row { id: string; title: string; kind: string; score: number }

const rows: Row[] = [
  { id: '1', title: 'Alpha', kind: 'exam', score: 3 },
  { id: '2', title: 'Bravo', kind: 'scholarship', score: 10 },
  { id: '3', title: 'Charlie', kind: 'exam', score: 1 },
]

const columns: Column<Row>[] = [
  {
    id: 'title',
    header: 'Title',
    cell: r => <button type="button">{r.title}</button>,
    sortValue: r => r.title,
    searchValue: r => r.title,
  },
  { id: 'kind', header: 'Kind', cell: r => r.kind },
  { id: 'score', header: 'Score', cell: r => r.score, sortValue: r => r.score, align: 'right' },
]

const filters: FilterDef<Row>[] = [
  { id: 'kind', label: 'Kind', options: [{ value: 'exam', label: 'Exam' }, { value: 'scholarship', label: 'Scholarship' }], predicate: (r, v) => r.kind === v },
]

const render = (props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) =>
  renderToStaticMarkup(
    <DataTable<Row> label="Things" rows={rows} columns={columns} rowKey={r => r.id} filters={filters} {...props} />,
  )

beforeEach(() => { search = '' })

describe('DataTable', () => {
  it('names the table with a caption', () => {
    expect(render()).toMatch(/<caption[^>]*>Things<\/caption>/)
  })

  it('renders human column labels as column headers', () => {
    const html = render()
    expect(html).toMatch(/<th[^>]*scope="col"/)
    expect(html).toContain('Title')
    expect(html).toContain('Score')
  })

  it('keeps the header sticky', () => {
    expect(render()).toMatch(/<thead[^>]*class="[^"]*sticky[^"]*top-0/)
  })

  it('sortable headers are buttons; only the sorted column carries aria-sort', () => {
    search = 'sort=-score'
    const html = render()
    expect(html).toMatch(/<th[^>]*aria-sort="descending"[^>]*>[\s\S]*?<button[^>]*>[\s\S]*?Score/)
    expect((html.match(/aria-sort=/g) ?? []).length).toBe(1)
    expect(html).toMatch(/<th[^>]*>\s*<button[^>]*>[\s\S]*?Title/)
  })

  it('applies the sort from the URL', () => {
    search = 'sort=-score'
    const html = render()
    expect(html.indexOf('Bravo')).toBeLessThan(html.indexOf('Alpha'))
    expect(html.indexOf('Alpha')).toBeLessThan(html.indexOf('Charlie'))
  })

  it('applies the search and filters from the URL', () => {
    search = 'q=char&kind=exam'
    const html = render()
    expect(html).toContain('Charlie')
    expect(html).not.toContain('Alpha')
    expect(html).not.toContain('Bravo')
  })

  it('shows a labelled search box pre-filled from the URL', () => {
    search = 'q=bra'
    const html = render()
    const id = html.match(/<input[^>]*type="search"[^>]*id="([^"]+)"|<input[^>]*id="([^"]+)"[^>]*type="search"/)!
    const inputId = id[1] ?? id[2]
    expect(html).toContain(`for="${inputId}"`)
    expect(html).toContain('value="bra"')
    expect(html).toContain('data-shortcut-search')
  })

  it('labels each filter', () => {
    const html = render()
    const m = html.match(/<select[^>]*id="([^"]+)"/)!
    expect(html).toMatch(new RegExp(`<label[^>]*for="${m[1]}"[^>]*>Kind</label>`))
  })

  it('says which rows are showing', () => {
    expect(render()).toContain('1–3 of 3')
  })

  it('paginates from the URL', () => {
    search = 'page=2'
    const html = render({ pageSize: 2 })
    expect(html).toContain('3–3 of 3')
    expect(html).toContain('Charlie')
    expect(html).not.toContain('>Alpha<')
    expect(html).toContain('Page 2 of 2')
  })

  it('never makes a table row a pseudo-button', () => {
    const html = render()
    expect(html).not.toMatch(/<tr[^>]*role="button"/)
    expect(html).not.toMatch(/<tr[^>]*onclick/i)
    expect(html).not.toMatch(/<tr[^>]*tabindex/)
  })

  it('puts the row action (a real button) in the first cell', () => {
    const html = render()
    expect(html).toMatch(/<tr[^>]*>\s*<t[dh][^>]*>\s*<button type="button">Alpha<\/button>/)
  })

  it('shows an empty state when there are no rows at all', () => {
    const html = render({ rows: [], emptyTitle: 'No things yet', emptyDescription: 'Add one to begin.' })
    expect(html).toContain('No things yet')
    expect(html).toContain('Add one to begin.')
  })

  it('distinguishes "no matches" from "no data" and offers a way back', () => {
    search = 'q=zzz'
    const html = render()
    expect(html).toContain('No matches')
    expect(html).toContain('Clear search and filters')
  })

  it('announces loading and shows skeleton rows instead of data', () => {
    const html = render({ loading: true })
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('Loading things')
    expect(html).not.toContain('Alpha')
  })

  it('reads its state from prefixed keys when given a prefix', () => {
    search = 'q=alpha&log_q=bravo'
    const html = render({ paramPrefix: 'log_' })
    expect(html).toContain('Bravo')
    expect(html).not.toContain('Alpha')
  })

  it('uses tokens only', () => {
    expect(render()).not.toMatch(/(?:bg|text|border)-\[(?:#|rgba?\()/)
  })
})
