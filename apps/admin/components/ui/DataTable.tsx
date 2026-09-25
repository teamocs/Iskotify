'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  applyTableState, formatRange, nextSort, parseTableState, serializeTableState,
  type SortState, type SortValue, type TableState,
} from '@/lib/table/tableState'
import { Button } from './Button'
import { EmptyState } from './EmptyState'
import { Icon } from './Icon'

export interface Column<T> {
  id: string
  /** Human label ("Deadline"), never the database column name. */
  header: string
  cell: (row: T) => ReactNode
  /** Presence makes the column sortable. */
  sortValue?: (row: T) => SortValue
  /** Text this column contributes to search. */
  searchValue?: (row: T) => string
  align?: 'left' | 'right'
  /** Keep the header for screen readers but hide it visually (e.g. "Actions"). */
  hideHeader?: boolean
  className?: string
}

export interface FilterDef<T> {
  id: string
  label: string
  options: { value: string; label: string }[]
  /** Label of the "no filter" option; defaults to "All". */
  allLabel?: string
  predicate: (row: T, value: string) => boolean
}

interface DataTableProps<T> {
  /** Accessible name (the table caption) and the noun used in messages. */
  label: string
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  filters?: FilterDef<T>[]
  searchable?: boolean
  searchPlaceholder?: string
  pageSize?: number
  /** Namespace for URL params when a page has more than one table. */
  paramPrefix?: string
  defaultSort?: SortState | null
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: ReactNode
  emptyAction?: ReactNode
  /** Extra controls at the end of the toolbar (e.g. "Add listing"). */
  toolbar?: ReactNode
}

const SKELETON_ROWS = 5

/**
 * The console's one table. Search, sort, filters and page live in the URL, so
 * a view survives refresh and can be linked. Rows are plain <tr>s: the row's
 * primary action belongs in its first cell as a real <button> or <a>.
 */
export function DataTable<T>({
  label, rows, columns, rowKey, filters = [], searchable = true, searchPlaceholder,
  pageSize = 25, paramPrefix = '', defaultSort = null, loading = false,
  emptyTitle, emptyDescription, emptyAction, toolbar,
}: DataTableProps<T>) {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const uid = useId()
  const captionId = `${uid}-caption`

  const stateOpts = {
    prefix: paramPrefix,
    sortable: columns.filter(c => c.sortValue).map(c => c.id),
    filters: filters.map(f => f.id),
    defaultSort,
  }

  const state = parseTableState(params, stateOpts)
  const [query, setQuery] = useState(state.q)
  // Follow the URL when it changes underneath us (back button, a link).
  useEffect(() => { setQuery(state.q) }, [state.q])

  function commit(next: TableState) {
    const qs = serializeTableState(params, next, stateOpts)
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const { total, range, pageRows } = applyTableState(rows, state, columns, filters, pageSize)
  const hasActiveCriteria = Boolean(state.q.trim()) || Object.values(state.filters).some(Boolean)
  const clearAll = () => { setQuery(''); commit({ ...state, q: '', filters: {}, page: 1 }) }
  const noun = label.toLowerCase()

  return (
    <div className="flex flex-col">
      {(searchable || filters.length > 0 || toolbar) && (
        <div className="flex flex-wrap items-end gap-3 px-4 py-3 border-b border-subtle">
          {searchable && (
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <label htmlFor={`${uid}-search`} className="sr-only">Search {noun}</label>
              <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
              <input
                id={`${uid}-search`}
                type="search"
                data-shortcut-search=""
                value={query}
                placeholder={searchPlaceholder ?? `Search ${noun}`}
                onChange={e => { setQuery(e.target.value); commit({ ...state, q: e.target.value, page: 1 }) }}
                className="block h-8 w-full rounded-sm border border-control bg-surface pl-8 pr-2 text-ui text-ink placeholder:text-ink-subtle"
              />
            </div>
          )}
          {filters.map(f => (
            <div key={f.id} className="flex items-center gap-2">
              <label htmlFor={`${uid}-f-${f.id}`} className="text-ui text-ink-muted">{f.label}</label>
              <select
                id={`${uid}-f-${f.id}`}
                value={state.filters[f.id] ?? ''}
                onChange={e => commit({ ...state, filters: { ...state.filters, [f.id]: e.target.value }, page: 1 })}
                className="h-8 rounded-sm border border-control bg-surface pl-2 pr-7 text-ui text-ink"
              >
                <option value="">{f.allLabel ?? 'All'}</option>
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          ))}
          {toolbar && <div className="ml-auto flex flex-wrap items-center gap-2">{toolbar}</div>}
        </div>
      )}

      <div
        role="region"
        aria-labelledby={captionId}
        aria-busy={loading || undefined}
        tabIndex={0}
        className="max-h-[70vh] overflow-auto focus-visible:outline-offset-[-2px]"
      >
        <table className="w-full border-separate border-spacing-0 text-ui">
          <caption id={captionId} className="sr-only">{label}</caption>
          <thead className="sticky top-0 z-10 bg-surface-3">
            <tr>
              {columns.map(col => {
                const sorted = state.sort?.id === col.id ? state.sort.dir : null
                const alignCls = col.align === 'right' ? 'text-right' : 'text-left'
                return (
                  <th
                    key={col.id}
                    scope="col"
                    aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={`border-b border-subtle px-3 py-2 text-xs font-semibold text-ink-muted whitespace-nowrap ${alignCls}`}
                  >
                    {col.hideHeader ? (
                      <span className="sr-only">{col.header}</span>
                    ) : col.sortValue ? (
                      <button
                        type="button"
                        onClick={() => commit({ ...state, sort: nextSort(state.sort, col.id), page: 1 })}
                        className={`-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-ink ${col.align === 'right' ? 'flex-row-reverse' : ''}`}
                      >
                        {col.header}
                        <Icon
                          name={sorted === 'asc' ? 'chevron-up' : sorted === 'desc' ? 'chevron-down' : 'chevrons-up-down'}
                          size={14}
                          className={sorted ? 'text-ink' : 'text-ink-subtle'}
                        />
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                  <tr key={i}>
                    {columns.map(col => (
                      <td key={col.id} className="border-b border-subtle px-3 py-2.5">
                        <span className="block h-3.5 w-3/4 rounded bg-neutral-soft animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              : pageRows.map(row => (
                  <tr key={rowKey(row)} className="transition-colors hover:bg-surface-hover">
                    {columns.map(col => (
                      <td
                        key={col.id}
                        className={`border-b border-subtle px-3 py-2 align-top text-ink ${col.align === 'right' ? 'text-right tabular-nums' : ''} ${col.className ?? ''}`}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>

        {loading && <p role="status" className="sr-only">Loading {noun}…</p>}
        {!loading && rows.length === 0 && (
          <EmptyState title={emptyTitle ?? `No ${noun} yet`} description={emptyDescription} action={emptyAction} />
        )}
        {!loading && rows.length > 0 && total === 0 && (
          <EmptyState
            icon="search"
            title="No matches"
            description={`No ${noun} match ${hasActiveCriteria ? 'your search or filters' : 'this view'}.`}
            action={<Button size="sm" onClick={clearAll}>Clear search and filters</Button>}
          />
        )}
      </div>

      {!loading && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-t border-subtle text-xs text-ink-muted">
          <p aria-live="polite" className="tabular-nums">{formatRange(range, total)}</p>
          {range.pageCount > 1 && (
            <nav aria-label={`${label} pages`} className="flex items-center gap-1">
              <Button size="sm" variant="ghost" icon="chevron-left" disabled={range.page <= 1} onClick={() => commit({ ...state, page: range.page - 1 })}>
                Previous
              </Button>
              <span className="px-2 tabular-nums">Page {range.page} of {range.pageCount}</span>
              <Button size="sm" variant="ghost" disabled={range.page >= range.pageCount} onClick={() => commit({ ...state, page: range.page + 1 })}>
                Next <Icon name="chevron-right" />
              </Button>
            </nav>
          )}
        </div>
      )}
    </div>
  )
}
