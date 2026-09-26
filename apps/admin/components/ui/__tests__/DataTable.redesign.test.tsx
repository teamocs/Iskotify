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

/*
 * The 2026-09 table redesign: toolbar (density, filter chips, active-filter
 * pills), sortable headers, selection + floating bulk bar, the pagination
 * footer, and the loading / empty / error states. Rendered to static markup
 * (the suite runs in node), so these read the markup a screen reader gets.
 */

interface Row { id: string; title: string; kind: string; score: number }

const rows: Row[] = [
  { id: '1', title: 'Alpha', kind: 'exam', score: 3 },
  { id: '2', title: 'Bravo', kind: 'scholarship', score: 10 },
  { id: '3', title: 'Charlie', kind: 'exam', score: 1 },
]

const columns: Column<Row>[] = [
  { id: 'title', header: 'Title', cell: r => r.title, sortValue: r => r.title, searchValue: r => r.title },
  { id: 'kind', header: 'Kind', cell: r => r.kind },
  { id: 'score', header: 'Score', cell: r => r.score, sortValue: r => r.score, numeric: true },
]

const filters: FilterDef<Row>[] = [
  {
    id: 'kind', label: 'Kind', allLabel: 'Any kind',
    options: [{ value: 'exam', label: 'Exam' }, { value: 'scholarship', label: 'Scholarship' }],
    predicate: (r, v) => r.kind === v,
  },
]

type Props = React.ComponentProps<typeof DataTable<Row>>
const render = (props: Partial<Props> = {}) =>
  renderToStaticMarkup(<DataTable<Row> label="Things" rows={rows} columns={columns} rowKey={r => r.id} filters={filters} {...props} />)

const selection = (selected: string[]) => ({
  selected,
  onChange: () => {},
  rowLabel: (r: Row) => r.title,
  actions: <button type="button">Publish selected</button>,
})

/** The opening tag of the first element whose attributes match `attr`. */
const tagWith = (html: string, attr: string) => html.match(new RegExp(`<[a-z]+[^>]*${attr}[^>]*>`))?.[0] ?? ''

beforeEach(() => { search = '' })

describe('density toggle', () => {
  it('offers Comfortable and Compact as a labelled pair of toggle buttons', () => {
    const html = render()
    expect(html).toMatch(/role="group"[^>]*aria-label="Row density"/)
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>[\s\S]*?Comfortable/)
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>[\s\S]*?Compact/)
  })

  it('starts comfortable on the server render and marks the table with it', () => {
    expect(render()).toMatch(/<table[^>]*data-density="comfortable"/)
  })
})

describe('sortable headers', () => {
  it('puts aria-sort on the sorted header only, and the header control is a button', () => {
    search = 'sort=-score'
    const html = render()
    expect(html).toMatch(/<th[^>]*aria-sort="descending"[^>]*>\s*<button[^>]*>[\s\S]*?Score/)
    expect((html.match(/aria-sort=/g) ?? []).length).toBe(1)
    expect(html).toMatch(/<th[^>]*>\s*<button[^>]*>[\s\S]*?Title/)
  })

  it('shows which way the column is sorted with a distinct icon', () => {
    search = 'sort=score'
    const html = render()
    expect(html).toContain('data-sort-icon="asc"')
    // Unsorted sortable columns show the neutral affordance.
    expect(html).toContain('data-sort-icon="none"')
  })
})

describe('numbers', () => {
  it('right-aligns numeric columns in tabular figures, header included', () => {
    const html = render()
    const th = html.match(/<th[^>]*>(?:(?!<\/th>)[\s\S])*Score[\s\S]*?<\/th>/)![0]
    expect(th).toMatch(/text-right/)
    expect(html).toMatch(/<td[^>]*class="[^"]*text-right[^"]*tabular-nums[^"]*"[^>]*>10<\/td>|<td[^>]*class="[^"]*tabular-nums[^"]*text-right[^"]*"[^>]*>10<\/td>/)
  })
})

describe('filter chips', () => {
  it('shows a count beside each option, computed from the rows', () => {
    const html = render()
    expect(html).toMatch(/<option value="exam">Exam \(2\)<\/option>/)
    expect(html).toMatch(/<option value="scholarship">Scholarship \(1\)<\/option>/)
  })

  it('lists active filters as removable pills with a clear-all', () => {
    search = 'kind=exam&q=al'
    const html = render()
    expect(html).toMatch(/aria-label="Remove filter Kind: Exam"/)
    expect(html).toMatch(/aria-label="Remove search “al”"/)
    expect(html).toMatch(/<button[^>]*>Clear all<\/button>/)
  })

  it('shows no pills or clear-all when nothing is filtered', () => {
    const html = render()
    expect(html).not.toContain('Remove filter')
    expect(html).not.toMatch(/>Clear all</)
  })
})

describe('selection', () => {
  it('marks the select-all indeterminate when only some rows on the page are selected', () => {
    const html = render({ selection: selection(['2']) })
    const all = tagWith(html, 'aria-label="Select all things on this page"')
    expect(all).toContain('data-state="indeterminate"')
    expect(all).not.toContain('checked=""')
  })

  it('marks the select-all checked, not indeterminate, when every row is selected', () => {
    const all = tagWith(render({ selection: selection(['1', '2', '3']) }), 'aria-label="Select all things on this page"')
    expect(all).toContain('data-state="checked"')
    expect(all).toContain('checked=""')
  })

  it('marks the select-all unchecked when nothing is selected', () => {
    const all = tagWith(render({ selection: selection([]) }), 'aria-label="Select all things on this page"')
    expect(all).toContain('data-state="unchecked"')
  })

  it('marks selected rows for the selected row style', () => {
    const html = render({ selection: selection(['2']) })
    expect(html).toMatch(/<tr[^>]*data-selected="true"[^>]*>(?:(?!<\/tr>)[\s\S])*Bravo/)
    expect((html.match(/data-selected="true"/g) ?? []).length).toBe(1)
  })
})

describe('floating bulk bar', () => {
  it('is absent until something is selected', () => {
    const html = render({ selection: selection([]) })
    expect(html).not.toContain('aria-label="Bulk actions"')
  })

  it('floats (sticky to the bottom of the view) with the count, the actions and a clear', () => {
    const html = render({ selection: selection(['1', '3']) })
    const bar = html.match(/<div[^>]*aria-label="Bulk actions"[^>]*>[\s\S]*?Clear selection/)![0]
    expect(bar).toMatch(/class="[^"]*sticky[^"]*bottom-/)
    expect(bar).toContain('2 selected')
    expect(bar).toContain('Publish selected')
  })

  it('keeps the always-present announcement region for bulk results', () => {
    const html = render({ selection: selection([]), announcement: '2 marked resolved' })
    expect(html).toMatch(/role="status"[^>]*>2 marked resolved<\/p>/)
  })
})

describe('pagination footer', () => {
  it('shows the range as "first–last of total"', () => {
    search = 'page=2'
    const html = renderToStaticMarkup(
      <DataTable<Row> label="Things" rows={rows.slice(0, 2)} columns={columns} rowKey={r => r.id} pageSize={25} server={{ total: 312 }} />,
    )
    expect(html).toContain('26–27 of 312')
    expect(html).toContain('Page 2 of 13')
  })

  it('offers first, previous, next and last page buttons, disabled at the edges', () => {
    const html = render({ pageSize: 2 })
    const btn = (name: string) => tagWith(html, `aria-label="${name}"`)
    expect(btn('First page')).toContain('disabled=""')
    expect(btn('Previous page')).toContain('disabled=""')
    expect(btn('Next page')).not.toContain('disabled=""')
    expect(btn('Last page')).not.toContain('disabled=""')
  })

  it('lets the operator pick rows per page, kept in the URL', () => {
    search = 'size=10'
    const html = render()
    const m = html.match(/<label[^>]*for="([^"]+)"[^>]*>Rows per page<\/label>/)
    expect(m).toBeTruthy()
    const select = tagWith(html, `id="${m![1]}"`)
    expect(select).toMatch(/^<select/)
    expect(html).toMatch(/<option value="10" selected="">10<\/option>/)
  })

  it('pages by the chosen size', () => {
    search = 'size=10'
    const many = Array.from({ length: 30 }, (_, i) => ({ id: String(i), title: `Row ${i}`, kind: 'exam', score: i }))
    const html = renderToStaticMarkup(<DataTable<Row> label="Things" rows={many} columns={columns} rowKey={r => r.id} />)
    expect(html).toContain('1–10 of 30')
  })

  it('keeps a server table at its fixed page size (no rows-per-page control)', () => {
    const html = renderToStaticMarkup(
      <DataTable<Row> label="Things" rows={rows} columns={columns} rowKey={r => r.id} pageSize={50} server={{ total: 3 }} />,
    )
    expect(html).not.toContain('Rows per page')
  })
})

describe('states', () => {
  it('shows skeleton rows while loading', () => {
    const html = render({ loading: true })
    expect((html.match(/data-skeleton=""/g) ?? []).length).toBeGreaterThanOrEqual(5)
    expect(html).toContain('Loading things')
  })

  it('shows an empty state with a next action when there is no data', () => {
    const html = render({ rows: [], emptyTitle: 'No things yet', emptyAction: <a href="/new">Add a thing</a> })
    expect(html).toContain('No things yet')
    expect(html).toContain('Add a thing')
  })

  it('shows an error with a retry instead of rows or an empty state', () => {
    const html = render({ error: 'relation does not exist', onRetry: () => {} })
    expect(html).toMatch(/role="alert"/)
    expect(html).toContain('Couldn’t load things')
    expect(html).toContain('relation does not exist')
    expect(html).toMatch(/<button[^>]*>[\s\S]*?Try again<\/button>/)
    expect(html).not.toContain('Alpha')
    expect(html).not.toContain('No matches')
  })

  it('keeps the toolbar on error so a filter can be changed', () => {
    const html = render({ error: 'boom' })
    expect(html).toContain('type="search"')
  })
})

describe('layout', () => {
  it('scrolls horizontally inside a focusable, labelled region', () => {
    const html = render()
    const region = tagWith(html, 'aria-labelledby=')
    expect(region).toContain('role="region"')
    expect(region).toContain('tabindex="0"')
    expect(region).toMatch(/overflow-auto/)
  })

  it('pins the first data column so it stays in view while scrolling sideways', () => {
    const html = render({ selection: selection([]) })
    expect(html).toMatch(/<td[^>]*data-pinned="true"[^>]*>Alpha<\/td>/)
  })

  it('truncates long text but keeps all of it reachable', () => {
    const long = 'A very long description that goes on and on well past any sensible column width'
    const cols: Column<Row>[] = [{ id: 'title', header: 'Title', cell: () => long, truncate: () => long }]
    const html = renderToStaticMarkup(<DataTable<Row> label="Things" rows={rows.slice(0, 1)} columns={cols} rowKey={r => r.id} />)
    expect(html).toMatch(new RegExp(`<span[^>]*class="[^"]*truncate[^"]*"[^>]*title="${long}"`))
  })
})
