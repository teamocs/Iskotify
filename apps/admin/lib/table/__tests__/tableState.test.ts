import { describe, it, expect } from 'vitest'
import {
  parseTableState,
  serializeTableState,
  sortRows,
  searchRows,
  paginate,
  formatRange,
  nextSort,
  applyTableState,
  type TableState,
} from '../tableState'

const opts = { sortable: ['title', 'deadline'], filters: ['type', 'status'] }

describe('parseTableState', () => {
  it('returns defaults for empty params', () => {
    expect(parseTableState(new URLSearchParams(''), opts)).toEqual({
      q: '', sort: null, filters: {}, page: 1,
    })
  })

  it('reads search, sort, filters and page', () => {
    const p = new URLSearchParams('q=scholar&sort=-deadline&type=exam&status=active&page=3')
    expect(parseTableState(p, opts)).toEqual({
      q: 'scholar',
      sort: { id: 'deadline', dir: 'desc' },
      filters: { type: 'exam', status: 'active' },
      page: 3,
    })
  })

  it('ignores a sort on a column that is not sortable', () => {
    const p = new URLSearchParams('sort=password')
    expect(parseTableState(p, opts).sort).toBeNull()
  })

  it('falls back to the default sort when none is given', () => {
    const p = new URLSearchParams('')
    expect(parseTableState(p, { ...opts, defaultSort: { id: 'title', dir: 'asc' } }).sort)
      .toEqual({ id: 'title', dir: 'asc' })
  })

  it('clamps nonsense pages to 1', () => {
    for (const v of ['0', '-4', 'abc', '1.5x']) {
      expect(parseTableState(new URLSearchParams(`page=${v}`), opts).page).toBe(1)
    }
  })

  it('namespaces every key with the prefix so two tables can share a URL', () => {
    const p = new URLSearchParams('log_q=err&log_page=2&q=other&log_status=error')
    const s = parseTableState(p, { sortable: [], filters: ['status'], prefix: 'log_' })
    expect(s).toEqual({ q: 'err', sort: null, filters: { status: 'error' }, page: 2 })
  })

  it('drops filters that are not declared', () => {
    const p = new URLSearchParams('secret=1&type=exam')
    expect(parseTableState(p, opts).filters).toEqual({ type: 'exam' })
  })
})

describe('serializeTableState', () => {
  const state: TableState = { q: 'up cat', sort: { id: 'deadline', dir: 'desc' }, filters: { type: 'exam' }, page: 2 }

  it('round-trips through parseTableState', () => {
    const qs = serializeTableState(new URLSearchParams(''), state, opts)
    expect(parseTableState(new URLSearchParams(qs), opts)).toEqual(state)
  })

  it('omits defaults so a clean table has a clean URL', () => {
    const qs = serializeTableState(new URLSearchParams(''), { q: '', sort: null, filters: {}, page: 1 }, opts)
    expect(qs).toBe('')
  })

  it('omits the sort when it equals the default sort', () => {
    const qs = serializeTableState(
      new URLSearchParams(''),
      { q: '', sort: { id: 'title', dir: 'asc' }, filters: {}, page: 1 },
      { ...opts, defaultSort: { id: 'title', dir: 'asc' } },
    )
    expect(qs).toBe('')
  })

  it('keeps unrelated params (another table, a tab) untouched', () => {
    const qs = serializeTableState(new URLSearchParams('tab=kb&kb_q=x'), { ...state, page: 1 }, { ...opts, prefix: 'log_' })
    const p = new URLSearchParams(qs)
    expect(p.get('tab')).toBe('kb')
    expect(p.get('kb_q')).toBe('x')
    expect(p.get('log_q')).toBe('up cat')
    expect(p.get('log_sort')).toBe('-deadline')
  })

  it('removes a filter that was cleared', () => {
    const qs = serializeTableState(new URLSearchParams('type=exam&status=active'), { q: '', sort: null, filters: { status: 'active' }, page: 1 }, opts)
    expect(new URLSearchParams(qs).has('type')).toBe(false)
    expect(new URLSearchParams(qs).get('status')).toBe('active')
  })
})

describe('nextSort', () => {
  it('starts ascending, then flips direction on the same column', () => {
    expect(nextSort(null, 'title')).toEqual({ id: 'title', dir: 'asc' })
    expect(nextSort({ id: 'title', dir: 'asc' }, 'title')).toEqual({ id: 'title', dir: 'desc' })
    expect(nextSort({ id: 'title', dir: 'desc' }, 'title')).toEqual({ id: 'title', dir: 'asc' })
  })

  it('switching column starts ascending again', () => {
    expect(nextSort({ id: 'title', dir: 'desc' }, 'deadline')).toEqual({ id: 'deadline', dir: 'asc' })
  })
})

describe('sortRows', () => {
  const rows = [
    { n: 'b', v: 10 },
    { n: 'a', v: 2 },
    { n: 'c', v: null },
    { n: 'd', v: 2 },
  ]

  it('sorts numbers numerically, not lexically', () => {
    expect(sortRows(rows, r => r.v, 'asc').map(r => r.n)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('keeps empty values last in both directions', () => {
    expect(sortRows(rows, r => r.v, 'desc').map(r => r.n)).toEqual(['b', 'a', 'd', 'c'])
  })

  it('is stable for ties', () => {
    expect(sortRows(rows, r => r.v, 'desc').filter(r => r.v === 2).map(r => r.n)).toEqual(['a', 'd'])
  })

  it('compares strings case-insensitively with natural numbers', () => {
    const s = [{ n: 'Item 10' }, { n: 'item 2' }, { n: 'Item 1' }]
    expect(sortRows(s, r => r.n, 'asc').map(r => r.n)).toEqual(['Item 1', 'item 2', 'Item 10'])
  })

  it('sorts ISO dates chronologically', () => {
    const d = [{ d: '2026-10-01' }, { d: '2026-01-15' }, { d: null }]
    expect(sortRows(d, r => (r.d ? new Date(r.d) : null), 'asc').map(r => r.d)).toEqual(['2026-01-15', '2026-10-01', null])
  })

  it('does not mutate the input', () => {
    const copy = [...rows]
    sortRows(rows, r => r.v, 'asc')
    expect(rows).toEqual(copy)
  })
})

describe('searchRows', () => {
  const rows = [{ t: 'DOST-SEI Scholarship', r: 'NCR' }, { t: 'UPCAT', r: 'Bicol' }]
  const text = (r: { t: string; r: string }) => `${r.t} ${r.r}`

  it('returns everything for a blank query', () => {
    expect(searchRows(rows, '   ', text)).toHaveLength(2)
  })

  it('matches case-insensitively', () => {
    expect(searchRows(rows, 'dost', text).map(r => r.t)).toEqual(['DOST-SEI Scholarship'])
  })

  it('requires every term to match, in any order', () => {
    expect(searchRows(rows, 'bicol upcat', text).map(r => r.t)).toEqual(['UPCAT'])
    expect(searchRows(rows, 'bicol dost', text)).toHaveLength(0)
  })
})

describe('paginate', () => {
  it('describes the first page', () => {
    expect(paginate(312, 1, 25)).toEqual({ page: 1, pageCount: 13, offset: 0, start: 1, end: 25 })
  })

  it('describes a short last page', () => {
    expect(paginate(312, 13, 25)).toEqual({ page: 13, pageCount: 13, offset: 300, start: 301, end: 312 })
  })

  it('clamps a page past the end to the last page', () => {
    expect(paginate(30, 9, 25).page).toBe(2)
  })

  it('handles an empty table', () => {
    expect(paginate(0, 4, 25)).toEqual({ page: 1, pageCount: 1, offset: 0, start: 0, end: 0 })
  })
})

describe('formatRange', () => {
  it('uses an en dash and the total', () => {
    expect(formatRange(paginate(312, 2, 25), 312)).toBe('Showing 26–50 of 312')
  })

  it('reads naturally with no rows', () => {
    expect(formatRange(paginate(0, 1, 25), 0)).toBe('Showing 0 of 0')
  })
})

describe('applyTableState', () => {
  const rows = [
    { id: '1', title: 'Scholar A', type: 'scholarship', status: 'active' },
    { id: '2', title: 'Exam B', type: 'exam', status: 'upcoming' },
    { id: '3', title: 'Scholar C', type: 'scholarship', status: 'closed' },
  ]
  const columns = [{ id: 'title', sortValue: (r: typeof rows[number]) => r.title, searchValue: (r: typeof rows[number]) => r.title }]
  const filters = [
    { id: 'type', predicate: (r: typeof rows[number], v: string) => r.type === v },
    { id: 'status', predicate: (r: typeof rows[number], v: string) => r.status === v },
  ]

  it('combines filters with AND', () => {
    const s: TableState = { q: '', sort: null, filters: { type: 'scholarship', status: 'active' }, page: 1 }
    expect(applyTableState(rows, s, columns, filters, 25).pageRows.map(r => r.id)).toEqual(['1'])
  })

  it('searches, sorts and paginates', () => {
    const s: TableState = { q: 'scholar', sort: { id: 'title', dir: 'desc' }, filters: {}, page: 1 }
    const out = applyTableState(rows, s, columns, filters, 1)
    expect(out.total).toBe(2)
    expect(out.pageRows.map(r => r.id)).toEqual(['3'])
    expect(out.range).toEqual({ page: 1, pageCount: 2, offset: 0, start: 1, end: 1 })
  })

  it('ignores a filter value of "all" or empty', () => {
    const s: TableState = { q: '', sort: null, filters: { type: '' }, page: 1 }
    expect(applyTableState(rows, s, columns, filters, 25).total).toBe(3)
  })
})
