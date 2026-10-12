// @vitest-environment jsdom
import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let search = ''
const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => '/admin/things',
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}))

import { SegmentedFilter, MAX_SEGMENT_OPTIONS } from '../SegmentedFilter'
import { DataTable, type FilterDef } from '../DataTable'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
]

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  search = ''
  replace.mockClear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const mount = (el: React.ReactElement) => act(() => root.render(el))
const radios = () => Array.from(host.querySelectorAll<HTMLElement>('[role="radio"]'))
const checked = () => radios().find(r => r.getAttribute('aria-checked') === 'true')
const key = (el: HTMLElement, k: string) =>
  act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })) })

describe('SegmentedFilter', () => {
  it('is a labelled radiogroup of radios, one checked', () => {
    const html = renderToStaticMarkup(<SegmentedFilter label="Status" options={OPTIONS} allLabel="All" value="" onChange={() => {}} />)
    const id = html.match(/role="radiogroup"[^>]*aria-labelledby="([^"]+)"/)![1]
    expect(html).toMatch(new RegExp(`<span id="${id}"[^>]*>Status</span>`))
    expect(html.match(/role="radio"/g)).toHaveLength(4)
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-checked="true"[^>]*>(<[^>]+>)*All/)
  })

  it('caps at five options (more stays a <select>)', () => {
    expect(MAX_SEGMENT_OPTIONS).toBe(5)
  })

  it('uses a roving tab stop: only the checked radio is in the Tab order', () => {
    mount(<SegmentedFilter label="Status" options={OPTIONS} value="resolved" onChange={() => {}} />)
    expect(radios().map(r => r.tabIndex)).toEqual([-1, 0, -1])
  })

  it('moves and selects with the arrow keys, wrapping, plus Home and End', () => {
    const onChange = vi.fn()
    mount(<SegmentedFilter label="Status" options={OPTIONS} allLabel="All" value="" onChange={onChange} />)
    const [all, open, , dismissed] = radios()
    key(all!, 'ArrowRight')
    expect(onChange).toHaveBeenLastCalledWith('open')
    expect(document.activeElement).toBe(open)
    key(all!, 'ArrowLeft')
    expect(onChange).toHaveBeenLastCalledWith('dismissed')
    expect(document.activeElement).toBe(dismissed)
    key(all!, 'ArrowDown')
    expect(onChange).toHaveBeenLastCalledWith('open')
    key(all!, 'End')
    expect(onChange).toHaveBeenLastCalledWith('dismissed')
    key(all!, 'Home')
    expect(onChange).toHaveBeenLastCalledWith('')
  })

  it('selects on click', () => {
    const onChange = vi.fn()
    mount(<SegmentedFilter label="Status" options={OPTIONS} value="open" onChange={onChange} />)
    act(() => radios()[2]!.click())
    expect(onChange).toHaveBeenCalledWith('dismissed')
  })

  it('shows per-option counts in tabular figures', () => {
    const html = renderToStaticMarkup(
      <SegmentedFilter label="Status" options={[{ value: 'open', label: 'Open', count: 12 }]} value="" onChange={() => {}} />,
    )
    expect(html).toMatch(/tabular-nums[^>]*>12</)
  })

  describe('URL sync (param mode)', () => {
    it('reads the checked option from the URL param', () => {
      search = 'status=resolved&page=3'
      mount(<SegmentedFilter label="Status" options={OPTIONS} allLabel="All" param="status" />)
      expect(checked()!.textContent).toContain('Resolved')
    })

    it('falls back to "All" when the param is absent or unknown', () => {
      search = 'status=bogus'
      mount(<SegmentedFilter label="Status" options={OPTIONS} allLabel="All" param="status" />)
      expect(checked()!.textContent).toContain('All')
    })

    it('writes the choice to the URL, keeping other params and resetting the page', () => {
      search = 'q=abc&page=3'
      mount(<SegmentedFilter label="Status" options={OPTIONS} allLabel="All" param="status" />)
      act(() => radios()[2]!.click())
      expect(replace).toHaveBeenCalledWith('/admin/things?q=abc&status=resolved', { scroll: false })
    })

    it('drops the param when "All" is chosen', () => {
      search = 'status=open'
      mount(<SegmentedFilter label="Status" options={OPTIONS} allLabel="All" param="status" />)
      act(() => radios()[0]!.click())
      expect(replace).toHaveBeenCalledWith('/admin/things', { scroll: false })
    })
  })
})

describe('DataTable filters', () => {
  interface Row { id: string; status: string }
  const rows: Row[] = [{ id: '1', status: 'open' }, { id: '2', status: 'open' }, { id: '3', status: 'resolved' }]
  const columns = [{ id: 'id', header: 'ID', cell: (r: Row) => r.id }]
  const filter = (n: number, segmented = true): FilterDef<Row> => ({
    id: 'status', label: 'Status', segmented,
    options: Array.from({ length: n }, (_, i) => OPTIONS[i] ?? { value: `v${i}`, label: `V${i}` }),
    predicate: (r, v) => r.status === v,
  })
  const render = (f: FilterDef<Row>) =>
    renderToStaticMarkup(<DataTable<Row> label="Things" rows={rows} columns={columns} rowKey={r => r.id} filters={[f]} />)

  it('renders a segmented filter (with counts) for five or fewer options', () => {
    const html = render(filter(3))
    expect(html).toMatch(/>Status<\/span><div role="radiogroup" aria-labelledby=/)
    expect(html).not.toMatch(/<select[^>]*id="[^"]*-f-status"/)
    expect(html).toMatch(/Open<span[^>]*tabular-nums[^>]*>2</)
  })

  it('keeps the native select for more than five options', () => {
    const html = render(filter(6))
    expect(html).not.toContain('role="radiogroup"')
    expect(html).toMatch(/<select[^>]*id="[^"]*-f-status"/)
  })

  it('keeps the native select when a filter does not opt in', () => {
    expect(render(filter(3, false))).not.toContain('role="radiogroup"')
  })

  it('checks the segment named by the URL, and still lists it as a removable pill', () => {
    search = 'status=resolved'
    const html = render(filter(3))
    expect(html).toMatch(/aria-checked="true"[^>]*>Resolved/)
    expect(html).toContain('aria-label="Remove filter Status: Resolved"')
  })
})
