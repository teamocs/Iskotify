'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  applyTableState, formatRange, nextSort, paginate, parseHiddenColumns, parseTableState, serializeHiddenColumns,
  serializeTableState, toggleId, togglePage,
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
  /**
   * Row selection with bulk actions. Controlled: the caller owns the selected
   * ids (so it can clear them after a bulk action succeeds). The bulk bar
   * appears only while something is selected.
   */
  selection?: TableSelection<T>
  /** Let the operator hide columns; the choice is kept in the URL (`hide=`). */
  columnChooser?: boolean
  /**
   * Server-driven mode for large tables. The URL state (q, sort, filters,
   * page) is still written by this table, but the caller fetches with it and
   * passes back only the current page as `rows` plus the matching `total`.
   * No client-side search, sort or paging is applied.
   */
  server?: { total: number }
}

export interface TableSelection<T> {
  selected: string[]
  onChange: (ids: string[]) => void
  /** Names the row in its checkbox label ("Select Alpha"). */
  rowLabel: (row: T) => string
  /** Bulk controls shown next to the count. */
  actions: ReactNode
}

function Checkbox({ label, checked, indeterminate = false, onChange }: {
  label: string; checked: boolean; indeterminate?: boolean; onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={onChange}
      className="h-4 w-4 cursor-pointer accent-maroon align-middle"
    />
  )
}

const SKELETON_ROWS = 5

/** The server returned one page; the range counts the rows it actually sent. */
function serverPage<T>(total: number, page: number, pageSize: number, rows: T[]) {
  const r = paginate(total, page, pageSize)
  const end = rows.length ? Math.min(r.end, r.offset + rows.length) : r.end
  return { total, range: { ...r, end }, pageRows: rows }
}

/**
 * The console's one table. Search, sort, filters and page live in the URL, so
 * a view survives refresh and can be linked. Rows are plain <tr>s: the row's
 * primary action belongs in its first cell as a real <button> or <a>.
 */
export function DataTable<T>({
  label, rows, columns, rowKey, filters = [], searchable = true, searchPlaceholder,
  pageSize = 25, paramPrefix = '', defaultSort = null, loading = false,
  emptyTitle, emptyDescription, emptyAction, toolbar, selection, columnChooser = false, server,
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
  const hidden = columnChooser ? parseHiddenColumns(params, columns.map(c => c.id), paramPrefix) : []
  const visibleColumns = columns.filter(c => !hidden.includes(c.id))
  function setHidden(next: string[]) {
    const qs = serializeHiddenColumns(params, next, paramPrefix)
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }
  const [query, setQuery] = useState(state.q)
  // Follow the URL when it changes underneath us (back button, a link).
  useEffect(() => { setQuery(state.q) }, [state.q])

  function commit(next: TableState) {
    const qs = serializeTableState(params, next, stateOpts)
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const hasActiveCriteria = Boolean(state.q.trim()) || Object.values(state.filters).some(Boolean)
  const { total, range, pageRows } = server
    ? serverPage(server.total, state.page, pageSize, rows)
    : applyTableState(rows, state, columns, filters, pageSize)
  // "Nothing exists" vs "nothing matches": the server can only tell us the latter by the criteria in play.
  const noData = server ? total === 0 && !hasActiveCriteria : rows.length === 0
  const noMatches = server ? total === 0 && hasActiveCriteria : rows.length > 0 && total === 0
  const clearAll = () => { setQuery(''); commit({ ...state, q: '', filters: {}, page: 1 }) }
  const noun = label.toLowerCase()
  const pageIds = pageRows.map(rowKey)
  const selectedOnPage = selection ? pageIds.filter(id => selection.selected.includes(id)).length : 0

  return (
    <div className="flex flex-col">
      {(searchable || filters.length > 0 || toolbar || columnChooser) && (
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
          {(toolbar || columnChooser) && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {columnChooser && (
                <details className="group">
                  <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-pill border border-strong bg-surface px-3 text-ui font-medium text-ink hover:bg-surface-hover [&::-webkit-details-marker]:hidden">
                    <Icon name="blueprint" />
                    Columns
                    {hidden.length > 0 && <span className="tabular-nums text-ink-muted">({visibleColumns.length}/{columns.length})</span>}
                  </summary>
                  <fieldset className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 rounded-sm border border-subtle bg-surface-3 px-3 py-2">
                    <legend className="sr-only">Visible columns</legend>
                    {columns.map(c => {
                      const shown = !hidden.includes(c.id)
                      const last = shown && visibleColumns.length === 1
                      return (
                        <label key={c.id} className="flex items-center gap-1.5 text-ui text-ink">
                          <input
                            type="checkbox"
                            checked={shown}
                            disabled={last}
                            onChange={() => setHidden(shown ? [...hidden, c.id] : hidden.filter(h => h !== c.id))}
                            className="h-4 w-4 accent-maroon"
                          />
                          {c.header}
                        </label>
                      )
                    })}
                  </fieldset>
                </details>
              )}
              {toolbar}
            </div>
          )}
        </div>
      )}

      {selection && selection.selected.length > 0 && (
        <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 border-b border-subtle bg-maroon-dim px-4 py-2">
          <p aria-live="polite" className="text-ui font-semibold tabular-nums text-ink">{selection.selected.length} selected</p>
          <div className="flex flex-wrap items-center gap-2">{selection.actions}</div>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => selection.onChange([])}>Clear selection</Button>
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
              {selection && (
                <th scope="col" className="w-10 border-b border-subtle px-3 py-2 text-left">
                  <Checkbox
                    label={`Select all ${noun} on this page`}
                    checked={pageIds.length > 0 && selectedOnPage === pageIds.length}
                    indeterminate={selectedOnPage > 0 && selectedOnPage < pageIds.length}
                    onChange={() => selection.onChange(togglePage(selection.selected, pageIds))}
                  />
                </th>
              )}
              {visibleColumns.map(col => {
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
                    {selection && <td className="border-b border-subtle px-3 py-2.5" />}
                    {visibleColumns.map(col => (
                      <td key={col.id} className="border-b border-subtle px-3 py-2.5">
                        <span className="block h-3.5 w-3/4 rounded bg-neutral-soft animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              : pageRows.map(row => {
                  const id = rowKey(row)
                  const isSelected = selection?.selected.includes(id) ?? false
                  return (
                  <tr key={id} className={`transition-colors hover:bg-surface-hover ${isSelected ? 'bg-maroon-dim' : ''}`}>
                    {selection && (
                      <td className="w-10 border-b border-subtle px-3 py-2 align-top">
                        <Checkbox
                          label={`Select ${selection.rowLabel(row)}`}
                          checked={isSelected}
                          onChange={() => selection.onChange(toggleId(selection.selected, id))}
                        />
                      </td>
                    )}
                    {visibleColumns.map(col => (
                      <td
                        key={col.id}
                        className={`border-b border-subtle px-3 py-2 align-top text-ink ${col.align === 'right' ? 'text-right tabular-nums' : ''} ${col.className ?? ''}`}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                  )
                })}
          </tbody>
        </table>

        {loading && <p role="status" className="sr-only">Loading {noun}…</p>}
        {!loading && noData && (
          <EmptyState title={emptyTitle ?? `No ${noun} yet`} description={emptyDescription} action={emptyAction} />
        )}
        {!loading && noMatches && (
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
