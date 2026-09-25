/**
 * Pure table state for the admin DataTable: search, sort, filters and page, all
 * kept in the URL so a filtered view can be bookmarked, shared, and survives a
 * refresh or the back button. No React, no Next — trivially unit-testable.
 */

export type SortDir = 'asc' | 'desc'
export interface SortState { id: string; dir: SortDir }
export type SortValue = string | number | boolean | Date | null | undefined

export interface TableState {
  q: string
  sort: SortState | null
  filters: Record<string, string>
  page: number
}

export interface TableStateOptions {
  /** Namespaces every key, so two tables can share one URL (e.g. "log_"). */
  prefix?: string
  /** Column ids that may be sorted; anything else in the URL is ignored. */
  sortable?: readonly string[]
  /** Filter ids that may be set; anything else in the URL is ignored. */
  filters?: readonly string[]
  defaultSort?: SortState | null
}

interface ParamReader { get(name: string): string | null }

const MAX_QUERY = 200

export function parseTableState(params: ParamReader, opts: TableStateOptions = {}): TableState {
  const p = opts.prefix ?? ''
  const q = (params.get(`${p}q`) ?? '').slice(0, MAX_QUERY)

  let sort: SortState | null = opts.defaultSort ?? null
  const rawSort = params.get(`${p}sort`)
  if (rawSort) {
    const desc = rawSort.startsWith('-')
    const id = desc ? rawSort.slice(1) : rawSort
    if ((opts.sortable ?? []).includes(id)) sort = { id, dir: desc ? 'desc' : 'asc' }
  }

  const filters: Record<string, string> = {}
  for (const id of opts.filters ?? []) {
    const v = params.get(`${p}${id}`)
    if (v) filters[id] = v
  }

  const rawPage = params.get(`${p}page`) ?? ''
  const page = /^\d+$/.test(rawPage) && Number(rawPage) >= 1 ? Number(rawPage) : 1

  return { q, sort, filters, page }
}

/** Writes `state` over `base`, keeping every param that isn't this table's. */
export function serializeTableState(base: ParamReader & { toString(): string }, state: TableState, opts: TableStateOptions = {}): string {
  const p = opts.prefix ?? ''
  const out = new URLSearchParams(base.toString())
  const set = (k: string, v: string | null) => (v ? out.set(`${p}${k}`, v) : out.delete(`${p}${k}`))

  set('q', state.q.trim() ? state.q : null)

  const def = opts.defaultSort ?? null
  const isDefault = state.sort?.id === def?.id && state.sort?.dir === def?.dir
  set('sort', !state.sort || isDefault ? null : `${state.sort.dir === 'desc' ? '-' : ''}${state.sort.id}`)

  for (const id of opts.filters ?? []) set(id, state.filters[id] || null)

  set('page', state.page > 1 ? String(state.page) : null)
  return out.toString()
}

/** Header click: a new column starts ascending; the same column flips. */
export function nextSort(current: SortState | null, id: string): SortState {
  if (current?.id === id) return { id, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return { id, dir: 'asc' }
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

function isEmpty(v: SortValue): boolean {
  return v === null || v === undefined || v === '' || (v instanceof Date && Number.isNaN(v.getTime()))
}

function compare(a: SortValue, b: SortValue): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return collator.compare(String(a), String(b))
}

/** Stable sort; empty values always sink to the bottom, whichever direction. */
export function sortRows<T>(rows: readonly T[], getValue: (row: T) => SortValue, dir: SortDir): T[] {
  const sign = dir === 'asc' ? 1 : -1
  return rows
    .map((row, index) => ({ row, index, value: getValue(row) }))
    .sort((x, y) => {
      const ex = isEmpty(x.value)
      const ey = isEmpty(y.value)
      if (ex || ey) return ex === ey ? x.index - y.index : ex ? 1 : -1
      return compare(x.value, y.value) * sign || x.index - y.index
    })
    .map(e => e.row)
}

/** Every whitespace-separated term must appear (case-insensitive), any order. */
export function searchRows<T>(rows: readonly T[], query: string, getText: (row: T) => string): T[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return [...rows]
  return rows.filter(row => {
    const text = getText(row).toLowerCase()
    return terms.every(t => text.includes(t))
  })
}

export interface PageRange { page: number; pageCount: number; offset: number; start: number; end: number }

export function paginate(total: number, page: number, pageSize: number): PageRange {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount)
  const offset = (current - 1) * pageSize
  if (total === 0) return { page: 1, pageCount: 1, offset: 0, start: 0, end: 0 }
  return { page: current, pageCount, offset, start: offset + 1, end: Math.min(offset + pageSize, total) }
}

export function formatRange(range: PageRange, total: number): string {
  if (total === 0) return 'Showing 0 of 0'
  return `Showing ${range.start}–${range.end} of ${total}`
}

export interface StateColumn<T> { id: string; sortValue?: (row: T) => SortValue; searchValue?: (row: T) => string }
export interface StateFilter<T> { id: string; predicate?: (row: T, value: string) => boolean }

/** Filter → search → sort → page, in that order. */
export function applyTableState<T>(
  rows: readonly T[],
  state: TableState,
  columns: readonly StateColumn<T>[],
  filters: readonly StateFilter<T>[],
  pageSize: number,
) {
  let out = rows.filter(row =>
    filters.every(f => {
      const v = state.filters[f.id]
      return !v || v === 'all' || !f.predicate || f.predicate(row, v)
    }),
  )

  const searchable = columns.filter(c => c.searchValue)
  if (state.q.trim() && searchable.length) {
    out = searchRows(out, state.q, row => searchable.map(c => c.searchValue!(row)).join(' '))
  }

  const sortCol = state.sort ? columns.find(c => c.id === state.sort!.id && c.sortValue) : undefined
  if (sortCol && state.sort) out = sortRows(out, sortCol.sortValue!, state.sort.dir)

  const range = paginate(out.length, state.page, pageSize)
  return { total: out.length, range, pageRows: out.slice(range.offset, range.offset + pageSize) }
}

/**
 * Column visibility, kept in the URL as `hide=a,b` so a trimmed view of a wide
 * table survives refresh and can be shared. Unknown ids are dropped, and at
 * least one column always stays visible.
 */
export function parseHiddenColumns(params: ParamReader, ids: readonly string[], prefix = ''): string[] {
  const raw = params.get(`${prefix}hide`) ?? ''
  const hidden = raw.split(',').filter(id => ids.includes(id))
  return hidden.length >= ids.length ? hidden.slice(0, ids.length - 1) : hidden
}

export function serializeHiddenColumns(base: { toString(): string }, hidden: readonly string[], prefix = ''): string {
  const out = new URLSearchParams(base.toString())
  if (hidden.length) out.set(`${prefix}hide`, hidden.join(','))
  else out.delete(`${prefix}hide`)
  return out.toString()
}

/** Toggle one id in or out of a selection, keeping order stable. */
export function toggleId(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]
}

/** Select-all for the visible page: add every page id, or remove them all if all were already in. */
export function togglePage(selected: readonly string[], pageIds: readonly string[]): string[] {
  const inSelection = new Set(selected)
  const onPage = new Set(pageIds)
  const allIn = pageIds.length > 0 && pageIds.every(id => inSelection.has(id))
  if (allIn) return selected.filter(id => !onPage.has(id))
  return [...selected, ...pageIds.filter(id => !inSelection.has(id))]
}
