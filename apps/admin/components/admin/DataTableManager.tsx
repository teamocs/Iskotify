'use client'

import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { parseTableState, type SortState } from '@/lib/table/tableState'
import type { DataTableConfig, DataTableColumnConfig } from '@/lib/dataTables'
import { notifySuccess, notifyError } from '@/lib/toast'
import { isDirty } from '@/lib/admin/formDirty'
import { useDebounce } from '@/lib/useDebounce'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { Drawer } from '@/components/ui/Drawer'
import { Field, controlClass } from '@/components/ui/Field'
import { Button, IconButton, buttonClass } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { Icon } from '@/components/ui/Icon'
import { ConfirmDialog } from './ConfirmDialog'

type Row = Record<string, unknown>
type Errors = Record<string, string>

interface ImportResultState {
  ok: boolean
  message: string
  errors?: { row: number; message: string }[]
}

const ACRONYMS = new Set(['id', 'url', 'ai', 'gwa', 'ph', 'pr', 'upcat', 'huc'])

/** `created_at` → "Created at", `course_id` → "Course ID". For columns with no configured label. */
export function humanizeColumnName(name: string): string {
  const words = name.split('_').filter(Boolean).map(w => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.toLowerCase()))
  const [first, ...rest] = words
  if (first === undefined) return name
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(' ')
}

/** The configured label, else a humanised column name. */
function columnLabel(name: string, config: DataTableConfig): string {
  return config.columns.find(c => c.name === name)?.label ?? humanizeColumnName(name)
}

/** Table headers drop the form hint ("Top Countries (JSON array)" → "Top Countries"). */
const headerLabel = (label: string) => label.replace(/\s*\(JSON[^)]*\)\s*$/i, '')

// ── Form <-> row ────────────────────────────────────────────────────────────

function emptyForm(config: DataTableConfig): Row {
  const out: Row = {}
  for (const col of config.columns) out[col.name] = col.type === 'boolean' ? false : ''
  if (config.idType === 'text') out[config.idColumn] = ''
  return out
}

function rowToForm(row: Row, config: DataTableConfig): Row {
  const out: Row = {}
  for (const col of config.columns) {
    const val = row[col.name]
    if (col.type === 'boolean') out[col.name] = !!val
    else if (col.type === 'json') out[col.name] = val == null ? '' : typeof val === 'string' ? val : JSON.stringify(val, null, 2)
    else out[col.name] = val == null ? '' : String(val)
  }
  out[config.idColumn] = row[config.idColumn] == null ? '' : String(row[config.idColumn])
  return out
}

function formToPayload(form: Row, config: DataTableConfig, isNew: boolean): Row {
  const payload: Row = {}
  for (const col of config.columns) {
    const val = form[col.name]
    if (col.type === 'boolean') payload[col.name] = !!val
    else if (col.type === 'number') payload[col.name] = val === '' || val == null ? null : Number(val)
    else if (col.type === 'json') {
      const trimmed = typeof val === 'string' ? val.trim() : ''
      payload[col.name] = trimmed ? JSON.parse(trimmed) : null
    } else payload[col.name] = val === '' ? null : val
  }
  if (isNew && config.idType === 'text') payload[config.idColumn] = form[config.idColumn]
  return payload
}

const isBlank = (v: unknown) => v == null || String(v).trim() === ''

function jsonError(value: unknown): string | undefined {
  const v = typeof value === 'string' ? value.trim() : ''
  if (!v) return undefined
  try { JSON.parse(v); return undefined } catch { return 'Enter valid JSON, e.g. ["a", "b"].' }
}

/** Per-field problems, keyed by column name. Empty when the row can be saved. */
export function validateRowForm(form: Row, config: DataTableConfig, isNew: boolean): Errors {
  const errors: Errors = {}
  if (isNew && config.idType === 'text' && isBlank(form[config.idColumn])) {
    errors[config.idColumn] = `${columnLabel(config.idColumn, config)} is required.`
  }
  for (const col of config.columns) {
    if (errors[col.name]) continue
    const val = form[col.name]
    if (col.required && col.type !== 'boolean' && isBlank(val)) {
      errors[col.name] = `${col.label} is required.`
    } else if (col.type === 'number' && !isBlank(val) && Number.isNaN(Number(val))) {
      errors[col.name] = `${col.label} must be a number.`
    } else if (col.type === 'json') {
      const e = jsonError(val)
      if (e) errors[col.name] = e
    }
  }
  return errors
}

// ── Row drawer ──────────────────────────────────────────────────────────────

interface DrawerProps {
  config: DataTableConfig
  row: Row | null // null = new
  onClose: () => void
  onSaved: () => void
  onRequestDelete: (row: Row) => void
}

const checkboxClass = 'h-4 w-4 cursor-pointer accent-maroon'

export function RowDrawer({ config, row, onClose, onSaved, onRequestDelete }: DrawerProps) {
  const isNew = row === null
  const formId = useId()
  const fieldId = (name: string) => `${formId}-${name}`
  const [initial] = useState<Row>(() => (isNew ? emptyForm(config) : rowToForm(row, config)))
  const [form, setForm] = useState<Row>(initial)
  const [errors, setErrors] = useState<Errors>({})
  const [serverError, setServerError] = useState('')
  const [saving, setSaving] = useState(false)
  const dirty = isDirty(form, initial)

  function change(col: Pick<DataTableColumnConfig, 'name' | 'type'>, value: unknown) {
    setForm(f => ({ ...f, [col.name]: value }))
    setErrors(prev => {
      // JSON is checked as you type; everything else clears once edited.
      const next = { ...prev }
      const e = col.type === 'json' ? jsonError(value) : undefined
      if (e) next[col.name] = e
      else delete next[col.name]
      return next
    })
  }

  async function handleSave() {
    setServerError('')
    const found = validateRowForm(form, config, isNew)
    setErrors(found)
    const first = Object.keys(found)[0]
    if (first) {
      document.getElementById(fieldId(first))?.focus()
      return
    }

    const payload = formToPayload(form, config, isNew)
    setSaving(true)
    try {
      const url = isNew
        ? `/api/admin/data/${config.table}`
        : `/api/admin/data/${config.table}?id=${encodeURIComponent(String(row[config.idColumn]))}`
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const message = body.error ?? 'Something went wrong'
        setServerError(message)
        notifyError(message)
        return
      }
      notifySuccess(isNew ? `${config.label} created` : `${config.label} saved`)
      onSaved()
    } catch {
      setServerError('Network error')
      notifyError('Network error')
    } finally {
      setSaving(false)
    }
  }

  // The text id is edited once (on create) and shown read-only after; uuid/int ids are server-managed.
  const idIsConfigured = config.columns.some(c => c.name === config.idColumn)
  const formColumns = config.columns.filter(col => col.name !== config.idColumn)
  const showIdOnly = !idIsConfigured && config.idType !== 'text'

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      title={isNew ? `New ${config.label} row` : `Edit ${config.label} row`}
      description={showIdOnly && !isNew ? `${columnLabel(config.idColumn, config)}: ${String(row[config.idColumn] ?? '')}` : undefined}
      onSubmit={handleSave}
      dirty={dirty}
      footer={close => (
        <>
          {!isNew && (
            <Button variant="ghost" icon="trash" className="mr-auto text-danger hover:bg-danger-soft hover:text-danger-strong" onClick={() => onRequestDelete(row)}>
              Delete
            </Button>
          )}
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving}>
            {saving ? 'Saving…' : isNew ? 'Create' : 'Save changes'}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        {serverError && <ErrorBanner title="Couldn’t save this row" message={serverError} />}

        {config.idType === 'text' && (
          <Field
            id={fieldId(config.idColumn)}
            label={columnLabel(config.idColumn, config)}
            required
            error={errors[config.idColumn]}
            hint={isNew ? undefined : 'The ID can’t be changed after the row is created.'}
          >
            {p => (
              <input
                {...p}
                type="text"
                value={String(form[config.idColumn] ?? '')}
                onChange={e => change({ name: config.idColumn, type: 'text' }, e.target.value)}
                readOnly={!isNew}
                className={`${controlClass} read-only:bg-surface-2 read-only:text-ink-muted`}
              />
            )}
          </Field>
        )}

        {formColumns.map(col => {
          const id = fieldId(col.name)
          const value = form[col.name]
          if (col.type === 'boolean') {
            return (
              <div key={col.name} className="flex items-center gap-2">
                <input
                  id={id}
                  type="checkbox"
                  checked={!!value}
                  onChange={e => change(col, e.target.checked)}
                  className={checkboxClass}
                />
                <label htmlFor={id} className="cursor-pointer text-sm text-ink">{col.label}</label>
              </div>
            )
          }
          return (
            <Field
              key={col.name}
              id={id}
              label={col.label}
              required={col.required}
              error={errors[col.name]}
              hint={col.type === 'json' ? 'JSON, e.g. ["Japan", "Canada"]. Leave empty for none.' : undefined}
            >
              {p =>
                col.type === 'textarea' || col.type === 'json' ? (
                  <textarea
                    {...p}
                    rows={col.type === 'json' ? 4 : 3}
                    value={String(value ?? '')}
                    onChange={e => change(col, e.target.value)}
                    className={`${controlClass} h-auto py-2 ${col.type === 'json' ? 'font-mono text-xs' : ''}`}
                  />
                ) : (
                  <input
                    {...p}
                    type="text"
                    inputMode={col.type === 'number' ? 'decimal' : undefined}
                    value={String(value ?? '')}
                    onChange={e => change(col, e.target.value)}
                    className={`${controlClass} ${col.type === 'number' ? 'tabular-nums' : ''}`}
                  />
                )
              }
            </Field>
          )
        })}
      </div>
    </Drawer>
  )
}

// ── Cells ───────────────────────────────────────────────────────────────────

const EMPTY = <span className="text-ink-subtle">—</span>

function textOf(v: unknown): string {
  if (v == null) return ''
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

function Cell({ value, type }: { value: unknown; type: DataTableColumnConfig['type'] }) {
  if (value == null || value === '') return EMPTY
  if (type === 'boolean') {
    return value
      ? <span className="inline-flex text-success"><Icon name="check" /><span className="sr-only">Yes</span></span>
      : <span className="text-ink-subtle">No</span>
  }
  const text = textOf(value)
  const width = type === 'textarea' || type === 'json' ? 'max-w-[18rem]' : 'max-w-[14rem]'
  return (
    <span title={text} className={`block truncate ${width} ${type === 'json' ? 'font-mono text-xs text-ink-muted' : ''}`}>
      {text}
    </span>
  )
}

/** Must equal PAGE_SIZE in app/api/admin/data/[table]/route.ts. */
export const DATA_PAGE_SIZE = 50

/** The route's list URL for a table view. The table's page is 1-based; the route's is 0-based. */
export function buildListUrl(table: string, view: { q: string; sort: SortState | null; page: number }): string {
  const p = new URLSearchParams({ page: String(Math.max(0, view.page - 1)) })
  const q = view.q.trim()
  if (q) p.set('search', q)
  if (view.sort) {
    p.set('sort', view.sort.id)
    p.set('dir', view.sort.dir)
  }
  return `/api/admin/data/${table}?${p}`
}

// ── Main ────────────────────────────────────────────────────────────────────

interface Props {
  config: DataTableConfig
}

type DrawerState = { row: Row | null } | null

export function DataTableManager({ config }: Props) {
  // Bumped to refetch the same view.
  const [nonce, setNonce] = useState(0)
  const [drawer, setDrawer] = useState<DrawerState>(null)
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fetchCountRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResultState | null>(null)

  // Text ids lead the table; server-generated ids (uuid/int) trail it.
  const idConfigured = config.columns.some(c => c.name === config.idColumn)
  const idCol: DataTableColumnConfig = { name: config.idColumn, label: humanizeColumnName(config.idColumn), type: 'text' }
  const ordered: DataTableColumnConfig[] = [
    ...(!idConfigured && config.idType === 'text' ? [idCol] : []),
    ...config.columns,
    ...(!idConfigured && config.idType !== 'text' ? [idCol] : []),
  ]
  // The route sorts by any configured column or the id; JSON columns aren't meaningfully sortable.
  const sortable = ordered.filter(c => c.type !== 'json').map(c => c.name)

  // The table writes q/sort/page to the URL; the server does the work, one page at a time.
  const params = useSearchParams()
  const state = parseTableState(params, { sortable })
  const q = useDebounce(state.q, 250)
  const listUrl = buildListUrl(config.table, { q, sort: state.sort, page: state.page })

  // The last answer and the request it answers; loading until it answers this one.
  const requestKey = `${listUrl}#${nonce}`
  const [loaded, setLoaded] = useState<{ key: string; rows: Row[]; total: number; error: string } | null>(null)
  const loading = loaded?.key !== requestKey
  const rows = loaded?.rows ?? []
  const total = loaded?.total ?? 0
  const loadError = loaded && !loading ? loaded.error : ''

  useEffect(() => {
    const id = ++fetchCountRef.current
    const isCurrent = () => id === fetchCountRef.current
    const settle = (patch: { rows?: Row[]; total?: number; error?: string }) =>
      setLoaded(prev => ({ key: requestKey, rows: prev?.rows ?? [], total: prev?.total ?? 0, error: '', ...patch }))
    async function load() {
      try {
        const res = await fetch(listUrl)
        if (!isCurrent()) return
        const body = await res.json().catch(() => ({}))
        // Re-check after the body is read: a newer request may have finished
        // while this one was still parsing, and must not be overwritten.
        if (!isCurrent()) return
        if (!res.ok) settle({ error: body.error ?? 'Failed to load' })
        else settle({ rows: body.rows ?? [], total: body.count ?? 0 })
      } catch {
        if (isCurrent()) settle({ error: 'Network error' })
      }
    }
    load()
  }, [listUrl, requestKey])

  /** Refetch the current page (after a save, delete or import, or Try again). */
  const fetchRows = () => setNonce(n => n + 1)

  const idOf = (row: Row) => String(row[config.idColumn] ?? '')

  // The first configured, non-id column usually names the row ("Name", "Title").
  const nameColumn = config.columns.find(c => c.name !== config.idColumn && (c.type === 'text' || c.type === 'textarea'))
  const rowName = (row: Row) => {
    const named = config.idType === 'text' ? idOf(row) : nameColumn ? textOf(row[nameColumn.name]) : ''
    return named || idOf(row) || 'row'
  }

  const searchCols = config.searchColumns

  const dataColumns: Column<Row>[] = ordered.map((col, i) => ({
    id: col.name,
    header: headerLabel(col.label),
    align: col.type === 'number' ? 'right' : undefined,
    // Presence marks the header sortable; the server does the sorting.
    sortValue: sortable.includes(col.name) ? (r: Row) => textOf(r[col.name]) : undefined,
    cell: i === 0
      ? (r: Row) => (
          <button
            type="button"
            onClick={() => setDrawer({ row: r })}
            title={textOf(r[col.name])}
            className="block max-w-[14rem] truncate text-left font-medium text-ink underline-offset-2 hover:underline"
          >
            {textOf(r[col.name]) || 'Untitled'}
          </button>
        )
      : (r: Row) => <Cell value={r[col.name]} type={col.type} />,
  }))

  const columns: Column<Row>[] = [
    ...dataColumns,
    {
      id: 'actions',
      header: 'Actions',
      hideHeader: true,
      align: 'right',
      cell: r => (
        <span className="inline-flex gap-1">
          <IconButton icon="pencil" label={`Edit ${rowName(r)}`} onClick={() => setDrawer({ row: r })} />
          <IconButton icon="trash" label={`Delete ${rowName(r)}`} onClick={() => setDeleteTarget(r)} className="hover:bg-danger-soft hover:text-danger-strong" />
        </span>
      ),
    },
  ]

  function onSaved() {
    setDrawer(null)
    fetchRows()
  }

  async function handleDelete(row: Row) {
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/data/${config.table}?id=${encodeURIComponent(idOf(row))}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        notifyError(body.error ?? 'Delete failed')
        return
      }
      notifySuccess(`${config.label} row deleted`)
      setDeleteTarget(null)
      setDrawer(null)
      fetchRows()
    } catch {
      notifyError('Network error')
    } finally {
      setDeleting(false)
    }
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setImporting(true)
    setImportResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/admin/data/${config.table}/import`, { method: 'POST', body: fd })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message = body.error ?? 'Import failed'
        setImportResult({ ok: false, message })
        notifyError(message)
      } else {
        const errCount = body.errors?.length ?? 0
        const message = `Imported ${body.total} row(s): ${body.inserted} new, ${body.updated} updated${errCount ? `, ${errCount} skipped` : ''}.`
        setImportResult({ ok: errCount === 0, message, errors: body.errors })
        if (errCount === 0) notifySuccess(message)
        else notifyError(message)
        fetchRows()
      }
    } catch {
      setImportResult({ ok: false, message: 'Network error' })
      notifyError('Network error')
    } finally {
      setImporting(false)
    }
  }

  const searchLabels = searchCols.map(c => headerLabel(columnLabel(c, config)).toLowerCase())

  return (
    <>
      {importResult && (
        <div
          role={importResult.ok ? 'status' : 'alert'}
          className={`rounded-sm px-4 py-3 text-ui ${importResult.ok ? 'bg-success-soft text-success-strong' : 'bg-warning-soft text-warning-strong'}`}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium">{importResult.message}</p>
            <IconButton icon="x" label="Dismiss import result" onClick={() => setImportResult(null)} className="-my-1 -mr-2 text-current" />
          </div>
          {importResult.errors && importResult.errors.length > 0 && (
            <ul className="mt-1 max-h-32 list-inside list-disc overflow-y-auto text-xs">
              {importResult.errors.slice(0, 20).map((er, i) => (
                <li key={i}>Row {er.row}: {er.message}</li>
              ))}
              {importResult.errors.length > 20 && <li>+ {importResult.errors.length - 20} more…</li>}
            </ul>
          )}
        </div>
      )}

      {loadError ? (
        <ErrorBanner
          title={`Couldn’t load ${config.label}`}
          message={loadError}
          action={<Button size="sm" icon="refresh" onClick={() => fetchRows()}>Try again</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-subtle bg-surface">
          <DataTable
            label={config.label}
            rows={rows}
            columns={columns}
            rowKey={idOf}
            loading={loading}
            columnChooser
            pageSize={DATA_PAGE_SIZE}
            server={{ total }}
            searchable={searchCols.length > 0}
            searchPlaceholder={searchLabels.length ? `Search ${searchLabels.join(', ')}` : undefined}
            emptyTitle={`No ${config.label.toLowerCase()} rows yet`}
            emptyDescription="Add a row by hand, or import a CSV or JSON file."
            toolbar={
              <>
                <a href={`/api/admin/data/${config.table}?export=1&format=csv`} className={buttonClass({ size: 'sm' })}>
                  <Icon name="download" /> CSV
                </a>
                <a href={`/api/admin/data/${config.table}?export=1&format=json`} className={buttonClass({ size: 'sm' })}>
                  <Icon name="download" /> JSON
                </a>
                <Button size="sm" icon="upload" loading={importing} onClick={() => fileInputRef.current?.click()}>
                  {importing ? 'Importing…' : 'Import'}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  onChange={handleImportFile}
                  className="hidden"
                  aria-label={`Import ${config.label} from CSV or JSON`}
                />
                <Button variant="primary" size="sm" icon="plus" onClick={() => setDrawer({ row: null })}>Add row</Button>
              </>
            }
          />
        </div>
      )}

      {drawer && (
        <RowDrawer
          key={drawer.row ? idOf(drawer.row) : 'new'}
          config={config}
          row={drawer.row}
          onClose={() => setDrawer(null)}
          onSaved={onSaved}
          onRequestDelete={setDeleteTarget}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          message={`Delete “${rowName(deleteTarget)}” from ${config.label}? This cannot be undone.`}
          onConfirm={() => { if (!deleting) handleDelete(deleteTarget) }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  )
}
