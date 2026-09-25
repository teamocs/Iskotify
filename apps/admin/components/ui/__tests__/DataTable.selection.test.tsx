import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

let search = ''
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => '/admin/things',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))

import { DataTable, type Column } from '../DataTable'

interface Row { id: string; title: string; kind: string }
const rows: Row[] = [
  { id: '1', title: 'Alpha', kind: 'exam' },
  { id: '2', title: 'Bravo', kind: 'scholarship' },
  { id: '3', title: 'Charlie', kind: 'exam' },
]
const columns: Column<Row>[] = [
  { id: 'title', header: 'Title', cell: r => r.title, searchValue: r => r.title },
  { id: 'kind', header: 'Kind', cell: r => `kind:${r.kind}` },
]

const render = (props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) =>
  renderToStaticMarkup(<DataTable<Row> label="Things" rows={rows} columns={columns} rowKey={r => r.id} {...props} />)

beforeEach(() => { search = '' })

describe('DataTable row selection', () => {
  const selection = (selected: string[]) => ({
    selected,
    onChange: () => {},
    rowLabel: (r: Row) => r.title,
    actions: <button type="button">Publish selected</button>,
  })

  it('adds a labelled checkbox to every row and a select-all on the page', () => {
    const html = render({ selection: selection([]) })
    expect(html).toContain('aria-label="Select Alpha"')
    expect(html).toContain('aria-label="Select Charlie"')
    expect(html).toMatch(/aria-label="Select all things on this page"/)
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(4)
  })

  it('reflects the controlled selection in the checkboxes', () => {
    const html = render({ selection: selection(['2']) })
    expect(html).toMatch(/<input[^>]*aria-label="Select Bravo"[^>]*checked=""|<input[^>]*checked=""[^>]*aria-label="Select Bravo"/)
    expect(html).not.toMatch(/<input[^>]*aria-label="Select Alpha"[^>]*checked=""/)
  })

  it('hides the bulk bar until something is selected', () => {
    expect(render({ selection: selection([]) })).not.toContain('Publish selected')
  })

  it('shows the count and the bulk actions once rows are selected', () => {
    const html = render({ selection: selection(['1', '3']) })
    expect(html).toContain('2 selected')
    expect(html).toContain('Publish selected')
    expect(html).toContain('Clear selection')
  })

  it('marks the select-all checked when every row on the page is selected', () => {
    const html = render({ selection: selection(['1', '2', '3']) })
    expect(html).toMatch(/<input[^>]*aria-label="Select all things on this page"[^>]*checked=""|<input[^>]*checked=""[^>]*aria-label="Select all things on this page"/)
  })
})

describe('DataTable column chooser', () => {
  it('renders a chooser with one labelled checkbox per column', () => {
    const html = render({ columnChooser: true })
    expect(html).toContain('Columns')
    expect(html).toMatch(/<label[^>]*>\s*<input[^>]*type="checkbox"[^>]*>\s*Title\s*<\/label>/)
    expect(html).toMatch(/<label[^>]*>\s*<input[^>]*type="checkbox"[^>]*>\s*Kind\s*<\/label>/)
  })

  it('hides the columns named in the URL', () => {
    search = 'hide=kind'
    const html = render({ columnChooser: true })
    expect(html).not.toContain('kind:exam')
    expect(html).not.toMatch(/<th[^>]*>Kind<\/th>/)
    expect(html).toContain('Alpha')
  })

  it('ignores hidden columns in the URL when there is no chooser', () => {
    search = 'hide=kind'
    expect(render()).toContain('kind:exam')
  })
})

describe('DataTable server mode', () => {
  // The server already searched, sorted and paged: rows ARE the current page.
  const pageRows: Row[] = [{ id: '51', title: 'Zulu', kind: 'exam' }, { id: '52', title: 'Alpha', kind: 'exam' }]

  it('renders the rows as given, without re-sorting or re-searching them', () => {
    search = 'q=nomatch&sort=title&page=2'
    const cols: Column<Row>[] = [{ ...columns[0]!, sortValue: r => r.title }, columns[1]!]
    const html = renderToStaticMarkup(
      <DataTable<Row> label="Things" rows={pageRows} columns={cols} rowKey={r => r.id} pageSize={50} server={{ total: 120 }} />,
    )
    expect(html.indexOf('Zulu')).toBeLessThan(html.indexOf('Alpha'))
    expect(html).not.toContain('No matches')
  })

  it('reports the range and page count from the server total', () => {
    search = 'page=2'
    const html = renderToStaticMarkup(
      <DataTable<Row> label="Things" rows={pageRows} columns={columns} rowKey={r => r.id} pageSize={50} server={{ total: 120 }} />,
    )
    expect(html).toContain('Showing 51–52 of 120')
    expect(html).toContain('Page 2 of 3')
  })

  it('says "no matches" when the server found nothing for a search', () => {
    search = 'q=zzz'
    const html = renderToStaticMarkup(
      <DataTable<Row> label="Things" rows={[]} columns={columns} rowKey={r => r.id} server={{ total: 0 }} />,
    )
    expect(html).toContain('No matches')
  })
})

// Bulk results must reach screen readers even after the selection (and its
// bar) is cleared, so the live region is always rendered.
describe('DataTable announcement', () => {
  it('always renders a polite status region, empty until there is something to say', () => {
    const html = render()
    expect(html).toMatch(/role="status"[^>]*aria-live="polite"[^>]*><\/p>|aria-live="polite"[^>]*role="status"[^>]*><\/p>/)
  })

  it('announces the bulk result text with no rows selected', () => {
    const html = render({ announcement: '2 marked resolved, 1 failed' })
    expect(html).toMatch(/role="status"[^>]*>2 marked resolved, 1 failed<\/p>|aria-live="polite"[^>]*>2 marked resolved, 1 failed<\/p>/)
  })
})
