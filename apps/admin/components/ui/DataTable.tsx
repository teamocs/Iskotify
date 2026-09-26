'use client'

import {
  memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore,
  type ReactNode, type RefObject,
} from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  PAGE_SIZE_OPTIONS, applyTableState, facetCounts, formatRange, nextSort, paginate, parseHiddenColumns, parsePageSize,
  parseTableState, serializeHiddenColumns, serializePageSize, serializeTableState, toggleId, togglePage,
  type SortState, type SortValue, type TableState,
} from '@/lib/table/tableState'
import { createDensityStore, type Density } from '@/lib/table/density'
import { Button, IconButton } from './Button'
import { EmptyState } from './EmptyState'
import { ErrorBanner } from './ErrorBanner'
import { Icon } from './Icon'
import { THead, Table, TableRegion, tdClass, thClass, type Pin } from './Table'

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
  /** A number: right-aligned, header included, in tabular figures. */
  numeric?: boolean
  /** Clamp the cell to one line; the returned full text is its tooltip. */
  truncate?: (row: T) => string
  /** Drop this column below 768px (the table scrolls sideways for the rest). */
  hideOnMobile?: boolean
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
  /** Client-side match. Server-driven tables (`server`) leave it out: the caller's route filters. */
  predicate?: (row: T, value: string) => boolean
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
  /** Default rows per page. Client tables let the operator change it (`size=`). */
  pageSize?: number
  /** Namespace for URL params when a page has more than one table. */
  paramPrefix?: string
  defaultSort?: SortState | null
  loading?: boolean
  /** A failed load: shown with Try again instead of rows (the toolbar stays). */
  error?: string
  onRetry?: () => void
  /** Defaults to "Couldn’t load {label}". */
  errorTitle?: string
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
  /** Outcome of the last bulk action ("2 marked resolved, 1 failed"), read to
   *  screen readers by an always-present live region, so it is heard even after
   *  the selection and its bar are cleared. */
  announcement?: string
  /** Let the operator hide columns; the choice is kept in the URL (`hide=`). */
  columnChooser?: boolean
  /** Keep the first data column in view while the table scrolls sideways. Default on. */
  pinFirstColumn?: boolean
  /**
   * Server-driven mode for large tables. The URL state (q, sort, filters,
   * page) is still written by this table, but the caller fetches with it and
   * passes back only the current page as `rows` plus the matching `total`.
   * No client-side search, sort or paging is applied, and the page size is fixed.
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

// ── Density (one console-wide preference, persisted) ────────────────────────

const densityStore = createDensityStore(() => {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
})

function useTableDensity(): [Density, (d: Density) => void] {
  const density = useSyncExternalStore(densityStore.subscribe, densityStore.getSnapshot, densityStore.getServerSnapshot)
  useEffect(() => {
    const onStorage = () => densityStore.sync()
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return [density, densityStore.set]
}

function DensityToggle({ density, onChange }: { density: Density; onChange: (d: Density) => void }) {
  const opts: { value: Density; label: string; icon: 'density-comfortable' | 'density-compact' }[] = [
    { value: 'comfortable', label: 'Comfortable', icon: 'density-comfortable' },
    { value: 'compact', label: 'Compact', icon: 'density-compact' },
  ]
  return (
    <div role="group" aria-label="Row density" className="inline-flex h-8 items-center rounded-pill border border-strong bg-surface p-0.5">
      {opts.map(o => (
        <button
          key={o.value}
          type="button"
          aria-pressed={density === o.value}
          title={`${o.label} rows`}
          onClick={() => onChange(o.value)}
          className="inline-flex h-full items-center gap-1.5 rounded-pill px-2 text-ui text-ink-muted transition-colors hover:text-ink aria-pressed:bg-neutral-soft aria-pressed:font-medium aria-pressed:text-ink"
        >
          <Icon name={o.icon} />
          <span className="sr-only xl:not-sr-only">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

// ── Pieces ───────────────────────────────────────────────────────────────────

type CheckState = 'checked' | 'unchecked' | 'indeterminate'

function Checkbox({ label, state, onChange }: { label: string; state: CheckState; onChange: () => void }) {
  const indeterminate = state === 'indeterminate'
  return (
    // The label widens the hit area to 24px (WCAG 2.5.8) around a 16px box.
    <label className="-m-1 inline-flex h-6 w-6 cursor-pointer items-center justify-center align-middle">
      <input
        ref={el => { if (el) el.indeterminate = indeterminate }}
        type="checkbox"
        aria-label={label}
        checked={state === 'checked'}
        data-state={state}
        onChange={onChange}
        className="h-4 w-4 cursor-pointer accent-maroon"
      />
    </label>
  )
}

/** Close a disclosure on a press outside it, or on Escape (focus returns to its summary). */
function useDismiss(ref: RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = ref.current
      if (el?.open && !el.contains(e.target as Node)) el.open = false
    }
    const onKey = (e: KeyboardEvent) => {
      const el = ref.current
      if (e.key !== 'Escape' || !el?.open || !el.contains(document.activeElement)) return
      el.open = false
      el.querySelector('summary')?.focus()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref])
}

function ColumnChooser<T>({ columns, hidden, onChange }: { columns: Column<T>[]; hidden: string[]; onChange: (h: string[]) => void }) {
  const ref = useRef<HTMLDetailsElement>(null)
  useDismiss(ref)
  const visibleCount = columns.length - hidden.length
  return (
    <details ref={ref} className="group relative">
      <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-pill border border-strong bg-surface px-3 text-ui font-medium text-ink hover:bg-surface-hover group-open:bg-surface-hover [&::-webkit-details-marker]:hidden">
        <Icon name="columns" />
        Columns
        {hidden.length > 0 && <span className="tabular-nums text-ink-muted">({visibleCount}/{columns.length})</span>}
      </summary>
      <fieldset className="absolute right-0 top-full z-30 mt-1 flex max-h-80 w-60 flex-col gap-0.5 overflow-y-auto rounded-sm border border-subtle bg-surface p-1.5 shadow-overlay">
        <legend className="sr-only">Visible columns</legend>
        {columns.map(c => {
          const shown = !hidden.includes(c.id)
          const last = shown && visibleCount === 1
          return (
            <label key={c.id} className="flex h-8 cursor-pointer items-center gap-2 rounded px-2 text-ui text-ink hover:bg-surface-hover has-[:disabled]:cursor-not-allowed has-[:disabled]:text-ink-subtle">
              <input
                type="checkbox"
                checked={shown}
                disabled={last}
                onChange={() => onChange(shown ? [...hidden, c.id] : hidden.filter(h => h !== c.id))}
                className="h-4 w-4 accent-maroon"
              />
              {c.header}
            </label>
          )
        })}
      </fieldset>
    </details>
  )
}

/** A filter as a chip: a native select (keyboard, touch and screen readers for free) dressed as a pill. */
function FilterChip<T>({ id, filter, value, counts, onChange }: {
  id: string; filter: FilterDef<T>; value: string; counts: Record<string, number> | null; onChange: (v: string) => void
}) {
  const active = Boolean(value)
  return (
    <div
      className={[
        'relative inline-flex h-8 items-center rounded-pill border text-ui transition-colors',
        active ? 'border-maroon bg-maroon-dim' : 'border-dashed border-control bg-surface hover:bg-surface-hover',
      ].join(' ')}
    >
      <label htmlFor={id} className="whitespace-nowrap pl-3 pr-1 text-ink-muted">{filter.label}</label>
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-full cursor-pointer appearance-none rounded-pill bg-transparent pl-1 pr-7 font-medium text-ink focus-visible:outline-offset-0"
      >
        <option value="">{filter.allLabel ?? 'All'}</option>
        {filter.options.map(o => (
          <option key={o.value} value={o.value}>{counts ? `${o.label} (${counts[o.value] ?? 0})` : o.label}</option>
        ))}
      </select>
      <Icon name="chevron-down" size={14} className="pointer-events-none absolute right-2.5 text-ink-muted" />
    </div>
  )
}

function Pill({ children, removeLabel, onRemove }: { children: ReactNode; removeLabel: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-pill bg-neutral-soft pl-2.5 pr-1 text-xs font-medium text-ink">
      {children}
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="inline-flex h-6 w-6 items-center justify-center rounded-pill text-ink-muted hover:bg-surface hover:text-ink"
      >
        <Icon name="x" size={12} />
      </button>
    </span>
  )
}

const SKELETON_ROWS = 6
const SKELETON_WIDTHS = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-2/5']

/** The server returned one page; the range counts the rows it actually sent. */
function serverPage<T>(total: number, page: number, pageSize: number, rows: T[]) {
  const r = paginate(total, page, pageSize)
  const end = rows.length ? Math.min(r.end, r.offset + rows.length) : r.end
  return { total, range: { ...r, end }, pageRows: rows }
}

interface RowProps<T> {
  row: T
  id: string
  columns: Column<T>[]
  /** undefined when the table has no selection column. */
  selected: boolean | undefined
  selectLabel: string
  onToggle: (id: string) => void
  pinFirst: boolean
}

/**
 * One body row, memoised: selecting a row re-renders that row (its `selected`
 * flips), not every row on the page. Cells re-render when the row object or
 * the column set changes.
 */
const DataRow = memo(function DataRow<T>({ row, id, columns, selected, selectLabel, onToggle, pinFirst }: RowProps<T>) {
  const hasSelect = selected !== undefined
  return (
    <tr className="dt-row" data-selected={selected ? 'true' : undefined}>
      {hasSelect && (
        <td className={tdClass({ pin: pinFirst ? 'select' : undefined }, 'w-10 py-2')}>
          <Checkbox label={selectLabel} state={selected ? 'checked' : 'unchecked'} onChange={() => onToggle(id)} />
        </td>
      )}
      {columns.map((col, i) => {
        const pin: Pin | undefined = pinFirst && i === 0 ? (hasSelect ? 'first-after-select' : 'first') : undefined
        const content = col.cell(row)
        return (
          <td
            key={col.id}
            data-pinned={pin ? 'true' : undefined}
            className={tdClass({ numeric: col.numeric, align: col.align, pin, hideOnMobile: col.hideOnMobile }, [
              col.align === 'right' && !col.numeric ? 'tabular-nums' : '',
              col.className ?? '',
            ].join(' '))}
          >
            {col.truncate ? <span className="block max-w-[20rem] truncate max-md:max-w-[10rem] [&>*]:block [&>*]:max-w-full [&>*]:truncate" title={col.truncate(row)}>{content}</span> : content}
          </td>
        )
      })}
    </tr>
  )
}) as <T>(props: RowProps<T>) => ReactNode

// ── The table ────────────────────────────────────────────────────────────────

/**
 * The console's one table. Search, sort, filters, page, page size and hidden
 * columns live in the URL, so a view survives refresh and can be linked; row
 * density is a persisted per-browser preference. Rows are plain <tr>s: the
 * row's primary action belongs in its first cell as a real <button> or <a>,
 * and secondary actions in a `RowActions` menu in the last.
 */
export function DataTable<T>({
  label, rows, columns, rowKey, filters = [], searchable = true, searchPlaceholder,
  pageSize = 25, paramPrefix = '', defaultSort = null, loading = false, error, onRetry, errorTitle,
  emptyTitle, emptyDescription, emptyAction, toolbar, selection, announcement, columnChooser = false,
  pinFirstColumn = true, server,
}: DataTableProps<T>) {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const uid = useId()
  const captionId = `${uid}-caption`
  const [density, setDensity] = useTableDensity()

  const stateOpts = {
    prefix: paramPrefix,
    sortable: columns.filter(c => c.sortValue).map(c => c.id),
    filters: filters.map(f => f.id),
    defaultSort,
  }

  const state = parseTableState(params, stateOpts)
  const size = server ? pageSize : parsePageSize(params, pageSize, paramPrefix)
  const hidden = columnChooser ? parseHiddenColumns(params, columns.map(c => c.id), paramPrefix) : []
  const hiddenKey = hidden.join(',')
  // Stable while the columns and the hidden set are, so memoised rows can skip re-rendering.
  const visibleColumns = useMemo(
    () => (hiddenKey ? columns.filter(c => !hiddenKey.split(',').includes(c.id)) : columns),
    [columns, hiddenKey],
  )

  const go = (qs: string) => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  const setHidden = (next: string[]) => go(serializeHiddenColumns(params, next, paramPrefix))
  const setSize = (next: number) => go(serializePageSize(params, next, pageSize, paramPrefix))
  const commit = (next: TableState) => go(serializeTableState(params, next, stateOpts))

  const [query, setQuery] = useState(state.q)
  // Follow the URL when it changes underneath us (back button, a link),
  // adjusted while rendering rather than in an effect.
  const [urlQ, setUrlQ] = useState(state.q)
  if (state.q !== urlQ) {
    setUrlQ(state.q)
    setQuery(state.q)
  }

  const activeFilters = filters.filter(f => state.filters[f.id])
  const hasActiveCriteria = Boolean(state.q.trim()) || activeFilters.length > 0
  const { total, range, pageRows } = server
    ? serverPage(server.total, state.page, size, rows)
    : applyTableState(rows, state, columns, filters, size)
  // Option counts are one pass over the rows per option: cheap at console sizes.
  const counts: Record<string, Record<string, number> | null> = server ? {} : Object.fromEntries(filters.map(f => [f.id, facetCounts(rows, f)]))
  // "Nothing exists" vs "nothing matches": the server can only tell us the latter by the criteria in play.
  const noData = server ? total === 0 && !hasActiveCriteria : rows.length === 0
  const noMatches = server ? total === 0 && hasActiveCriteria : rows.length > 0 && total === 0
  const clearAll = () => { setQuery(''); commit({ ...state, q: '', filters: {}, page: 1 }) }
  const noun = label.toLowerCase()

  // Selection. The toggle handler is stable (it reads the latest selection
  // from a ref) so a memoised row does not re-render when another row changes.
  const selectionRef = useRef(selection)
  useLayoutEffect(() => { selectionRef.current = selection })
  const onToggle = useCallback((id: string) => {
    const s = selectionRef.current
    if (s) s.onChange(toggleId(s.selected, id))
  }, [])
  const pageIds = pageRows.map(rowKey)
  // Selection can span pages (server tables), so look ids up in a Set.
  const selectedSet = new Set(selection?.selected)
  const selectedOnPage = pageIds.filter(id => selectedSet.has(id)).length
  const allState: CheckState = pageIds.length > 0 && selectedOnPage === pageIds.length
    ? 'checked'
    : selectedOnPage > 0 ? 'indeterminate' : 'unchecked'
  const barOpen = Boolean(selection && selection.selected.length > 0)

  const showPills = hasActiveCriteria && !loading
  const pinFirst = pinFirstColumn && visibleColumns.length > 1

  const lastPage = range.pageCount
  const canPage = !loading && !error && lastPage > 1
  const showSize = !server && !loading && !error && (total > PAGE_SIZE_OPTIONS[0] || size !== pageSize)

  return (
    <div className="flex flex-col">
      <p role="status" aria-live="polite" className="sr-only">{announcement ?? ''}</p>

      {/* The toolbar always renders: the density toggle lives in it. */}
      {(
        <div className="flex flex-wrap items-center gap-2 border-b border-subtle px-3 py-2.5 sm:px-4">
          {searchable && (
            <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
              <label htmlFor={`${uid}-search`} className="sr-only">Search {noun}</label>
              <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
              <input
                id={`${uid}-search`}
                type="search"
                name={`${paramPrefix}q`}
                autoComplete="off"
                spellCheck={false}
                data-shortcut-search=""
                value={query}
                placeholder={searchPlaceholder ?? `Search ${noun}…`}
                onChange={e => { setQuery(e.target.value); commit({ ...state, q: e.target.value, page: 1 }) }}
                className="block h-8 w-full rounded-pill border border-control bg-surface pl-8 pr-3 text-ui text-ink placeholder:text-ink-subtle"
              />
            </div>
          )}
          {filters.map(f => (
            <FilterChip
              key={f.id}
              id={`${uid}-f-${f.id}`}
              filter={f}
              value={state.filters[f.id] ?? ''}
              counts={counts[f.id] ?? null}
              onChange={v => commit({ ...state, filters: { ...state.filters, [f.id]: v }, page: 1 })}
            />
          ))}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {columnChooser && <ColumnChooser columns={columns} hidden={hidden} onChange={setHidden} />}
            <DensityToggle density={density} onChange={setDensity} />
            {toolbar}
          </div>
        </div>
      )}

      {showPills && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-subtle px-3 py-2 sm:px-4">
          <span className="mr-1 text-xs text-ink-muted">Showing only</span>
          {state.q.trim() && (
            <Pill removeLabel={`Remove search “${state.q.trim()}”`} onRemove={() => { setQuery(''); commit({ ...state, q: '', page: 1 }) }}>
              Search: “{state.q.trim()}”
            </Pill>
          )}
          {activeFilters.map(f => {
            const v = state.filters[f.id]!
            const text = `${f.label}: ${f.options.find(o => o.value === v)?.label ?? v}`
            return (
              <Pill key={f.id} removeLabel={`Remove filter ${text}`} onRemove={() => commit({ ...state, filters: { ...state.filters, [f.id]: '' }, page: 1 })}>
                {text}
              </Pill>
            )
          })}
          <button type="button" onClick={clearAll} className="ml-1 h-7 rounded-pill px-2 text-xs font-medium text-maroon hover:bg-maroon-dim">Clear all</button>
        </div>
      )}

      {error ? (
        <div className="p-3 sm:p-4">
          <ErrorBanner
            title={errorTitle ?? `Couldn’t load ${noun}`}
            message={error}
            action={onRetry && <Button size="sm" icon="refresh" onClick={onRetry}>Try again</Button>}
          />
        </div>
      ) : (
        <TableRegion labelledBy={captionId} busy={loading} maxHeight className={`scroll-pt-10 ${barOpen ? 'pb-16 scroll-pb-16' : ''}`}>
          <Table caption={label} captionId={captionId} density={density}>
            <THead>
              <tr>
                {selection && (
                  <th scope="col" className={thClass({ pin: pinFirst ? 'select' : undefined }, 'w-10')}>
                    <Checkbox
                      label={`Select all ${noun} on this page`}
                      state={allState}
                      onChange={() => selection.onChange(togglePage(selection.selected, pageIds))}
                    />
                  </th>
                )}
                {visibleColumns.map((col, i) => {
                  const sorted = state.sort?.id === col.id ? state.sort.dir : null
                  const right = col.numeric || col.align === 'right'
                  const pin: Pin | undefined = pinFirst && i === 0 ? (selection ? 'first-after-select' : 'first') : undefined
                  return (
                    <th
                      key={col.id}
                      scope="col"
                      aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : undefined}
                      className={thClass({ numeric: col.numeric, align: col.align, pin, hideOnMobile: col.hideOnMobile })}
                    >
                      {col.hideHeader ? (
                        <span className="sr-only">{col.header}</span>
                      ) : col.sortValue ? (
                        <button
                          type="button"
                          onClick={() => commit({ ...state, sort: nextSort(state.sort, col.id), page: 1 })}
                          className={`group/sort -mx-1.5 inline-flex h-6 items-center gap-1 rounded px-1.5 hover:bg-neutral-soft hover:text-ink ${sorted ? 'text-ink' : ''} ${right ? 'flex-row-reverse' : ''}`}
                        >
                          {col.header}
                          <Icon
                            name={sorted === 'asc' ? 'arrow-up' : sorted === 'desc' ? 'arrow-down' : 'chevrons-up-down'}
                            size={sorted ? 13 : 12}
                            data-sort-icon={sorted ?? 'none'}
                            className={sorted ? 'text-maroon' : 'text-ink-subtle opacity-60 group-hover/sort:opacity-100'}
                          />
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  )
                })}
              </tr>
            </THead>
            <tbody>
              {loading
                ? Array.from({ length: SKELETON_ROWS }, (_, r) => (
                    <tr key={r} className="dt-row" data-skeleton="">
                      {selection && <td className={tdClass({}, 'w-10')}><span className="block h-4 w-4 rounded bg-neutral-soft" /></td>}
                      {visibleColumns.map((col, c) => (
                        <td key={col.id} className={tdClass({ hideOnMobile: col.hideOnMobile })}>
                          <span className={`block h-3.5 animate-pulse rounded bg-neutral-soft ${SKELETON_WIDTHS[(r + c) % SKELETON_WIDTHS.length]} ${col.numeric ? 'ml-auto w-10' : ''}`} />
                        </td>
                      ))}
                    </tr>
                  ))
                : pageRows.map(row => {
                    const id = rowKey(row)
                    return (
                      <DataRow<T>
                        key={id}
                        row={row}
                        id={id}
                        columns={visibleColumns}
                        selected={selection ? selectedSet.has(id) : undefined}
                        selectLabel={selection ? `Select ${selection.rowLabel(row)}` : ''}
                        onToggle={onToggle}
                        pinFirst={pinFirst}
                      />
                    )
                  })}
            </tbody>
          </Table>

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
        </TableRegion>
      )}

      {selection && barOpen && (
        <div role="region" aria-label="Bulk actions" className="pointer-events-none sticky bottom-4 z-30 -mt-14 mb-2 flex justify-center px-3">
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1.5 rounded-pill border border-strong bg-surface py-1 pl-1 pr-1.5 shadow-overlay animate-slideUp">
            <p aria-live="polite" className="rounded-pill bg-maroon-dim px-3 py-1 text-ui font-semibold tabular-nums text-maroon">
              {selection.selected.length} selected
            </p>
            <div className="flex flex-wrap items-center gap-1.5">{selection.actions}</div>
            <span aria-hidden="true" className="mx-0.5 h-5 border-l border-subtle" />
            <Button size="sm" variant="ghost" icon="x" onClick={() => selection.onChange([])}>Clear selection</Button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-subtle px-3 py-2 text-xs text-ink-muted sm:px-4">
          <p aria-live="polite" className="tabular-nums">{formatRange(range, total)}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {showSize && (
              <div className="flex items-center gap-2">
                <label htmlFor={`${uid}-size`}>Rows per page</label>
                <select
                  id={`${uid}-size`}
                  value={size}
                  onChange={e => setSize(Number(e.target.value))}
                  className="h-7 rounded-sm border border-control bg-surface pl-2 pr-6 text-xs tabular-nums text-ink"
                >
                  {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}
            {canPage && (
              <nav aria-label={`${label} pages`} className="flex items-center gap-0.5">
                <span className="mr-2 tabular-nums">Page {range.page} of {lastPage}</span>
                <IconButton icon="chevrons-left" label="First page" disabled={range.page <= 1} onClick={() => commit({ ...state, page: 1 })} className="disabled:opacity-40" />
                <IconButton icon="chevron-left" label="Previous page" disabled={range.page <= 1} onClick={() => commit({ ...state, page: range.page - 1 })} className="disabled:opacity-40" />
                <IconButton icon="chevron-right" label="Next page" disabled={range.page >= lastPage} onClick={() => commit({ ...state, page: range.page + 1 })} className="disabled:opacity-40" />
                <IconButton icon="chevrons-right" label="Last page" disabled={range.page >= lastPage} onClick={() => commit({ ...state, page: lastPage })} className="disabled:opacity-40" />
              </nav>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
