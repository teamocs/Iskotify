'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { DataTableConfig, DataTableColumnConfig } from '@/lib/dataTables'

interface Row extends Record<string, unknown> {}

interface FetchState {
  rows: Row[]
  count: number
  loading: boolean
  error: string
}

interface DrawerState {
  open: boolean
  row: Row | null // null = new
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// Build empty form from config columns
function emptyForm(config: DataTableConfig): Row {
  const out: Row = {}
  for (const col of config.columns) {
    if (col.type === 'boolean') out[col.name] = false
    else if (col.type === 'number') out[col.name] = ''
    else if (col.type === 'json') out[col.name] = ''
    else out[col.name] = ''
  }
  return out
}

function rowToForm(row: Row, config: DataTableConfig): Row {
  const out: Row = {}
  for (const col of config.columns) {
    const val = row[col.name]
    if (col.type === 'boolean') out[col.name] = !!val
    else if (col.type === 'json') {
      out[col.name] = val == null ? '' : (typeof val === 'string' ? val : JSON.stringify(val, null, 2))
    } else if (col.type === 'number') {
      out[col.name] = val == null ? '' : String(val)
    } else {
      out[col.name] = val == null ? '' : String(val)
    }
  }
  // Carry the id
  out[config.idColumn] = row[config.idColumn] ?? ''
  return out
}

function formToPayload(form: Row, config: DataTableConfig, isNew: boolean): Row {
  const payload: Row = {}
  for (const col of config.columns) {
    const val = form[col.name]
    if (col.type === 'boolean') {
      payload[col.name] = !!val
    } else if (col.type === 'number') {
      payload[col.name] = val === '' || val == null ? null : Number(val)
    } else if (col.type === 'json') {
      // Re-validate JSON here regardless of live jsonErrors state
      if (val === '' || val == null) {
        payload[col.name] = null
      } else {
        const trimmed = (val as string).trim()
        if (!trimmed) {
          payload[col.name] = null
        } else {
          // Throws on invalid JSON — caller (handleSave) must catch this
          payload[col.name] = JSON.parse(trimmed)
        }
      }
    } else {
      payload[col.name] = val === '' ? null : val
    }
  }
  // For new text-id rows, include the id
  if (isNew && config.idType === 'text') {
    payload[config.idColumn] = form[config.idColumn]
  }
  return payload
}

// ── Field Renderer ──────────────────────────────────────────────────────────

interface FieldProps {
  col: DataTableColumnConfig
  value: unknown
  onChange: (name: string, value: unknown) => void
  jsonError: string
  onJsonError: (name: string, err: string) => void
}

const inputCls = "w-full px-3 py-2 rounded-[10px] border border-black/[0.08] text-sm bg-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#800000]/20 focus:border-[#800000] text-[#1d1d1f]"
const labelCls = "block text-[10px] font-semibold text-[#aeaeb2] uppercase tracking-wider mb-1"

function Field({ col, value, onChange, jsonError, onJsonError }: FieldProps) {
  if (col.type === 'boolean') {
    return (
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={col.name}
          checked={!!value}
          onChange={(e) => onChange(col.name, e.target.checked)}
          className="w-4 h-4 rounded accent-[#800000]"
        />
        <label htmlFor={col.name} className="text-sm text-[#1d1d1f] cursor-pointer">{col.label}</label>
      </div>
    )
  }

  if (col.type === 'textarea') {
    return (
      <div>
        <label className={labelCls}>{col.label}{col.required && <span className="text-red-500 ml-0.5">*</span>}</label>
        <textarea
          value={value as string}
          onChange={(e) => onChange(col.name, e.target.value)}
          rows={3}
          className={inputCls}
        />
      </div>
    )
  }

  if (col.type === 'json') {
    return (
      <div>
        <label className={labelCls}>{col.label}</label>
        <textarea
          value={value as string}
          onChange={(e) => {
            onChange(col.name, e.target.value)
            const v = e.target.value.trim()
            if (!v) { onJsonError(col.name, ''); return }
            try { JSON.parse(v); onJsonError(col.name, '') }
            catch { onJsonError(col.name, 'Invalid JSON') }
          }}
          rows={3}
          className={inputCls + ' font-mono text-xs'}
          placeholder="[]"
        />
        {jsonError && <p className="text-xs text-red-600 mt-1">{jsonError}</p>}
      </div>
    )
  }

  if (col.type === 'number') {
    return (
      <div>
        <label className={labelCls}>{col.label}{col.required && <span className="text-red-500 ml-0.5">*</span>}</label>
        <input
          type="number"
          value={value as string}
          onChange={(e) => onChange(col.name, e.target.value)}
          className={inputCls}
        />
      </div>
    )
  }

  // text (default)
  return (
    <div>
      <label className={labelCls}>{col.label}{col.required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <input
        type="text"
        value={value as string}
        onChange={(e) => onChange(col.name, e.target.value)}
        className={inputCls}
      />
    </div>
  )
}

// ── Row Drawer ──────────────────────────────────────────────────────────────

interface DrawerProps {
  config: DataTableConfig
  row: Row | null
  onClose: () => void
  onSaved: () => void
}

function RowDrawer({ config, row, onClose, onSaved }: DrawerProps) {
  const isNew = row === null
  const [form, setForm] = useState<Row>(() =>
    isNew ? emptyForm(config) : rowToForm(row!, config)
  )
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)

  function handleChange(name: string, value: unknown) {
    setForm(f => ({ ...f, [name]: value }))
  }

  function handleJsonError(name: string, err: string) {
    setJsonErrors(prev => ({ ...prev, [name]: err }))
  }

  async function handleSave() {
    setError('')
    // Validate required columns
    for (const col of config.columns) {
      if (col.required && (form[col.name] === '' || form[col.name] == null)) {
        setError(`${col.label} is required.`)
        return
      }
    }
    // Validate text-id required for new rows
    if (isNew && config.idType === 'text') {
      const idVal = form[config.idColumn]
      if (!idVal || String(idVal).trim() === '') {
        setError(`${config.idColumn} is required.`)
        return
      }
    }
    // Validate no JSON errors (live map check)
    const hasJsonErr = Object.values(jsonErrors).some(e => !!e)
    if (hasJsonErr) {
      setError('Fix JSON errors before saving.')
      return
    }

    // Re-validate JSON fields inside formToPayload — catch any stale/missed errors
    let payload: Row
    try {
      payload = formToPayload(form, config, isNew)
    } catch {
      setError('One or more JSON fields contain invalid JSON. Please fix before saving.')
      return
    }
    setSaving(true)
    try {
      let res: Response
      if (isNew) {
        res = await fetch(`/api/admin/data/${config.table}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        const id = row![config.idColumn]
        res = await fetch(`/api/admin/data/${config.table}?id=${encodeURIComponent(String(id))}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Something went wrong')
        return
      }
      onSaved()
    } catch (e) {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!row) return
    setSaving(true)
    try {
      const id = row[config.idColumn]
      const res = await fetch(`/api/admin/data/${config.table}?id=${encodeURIComponent(String(id))}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Delete failed')
        return
      }
      onSaved()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close drawer"
        className="flex-1 bg-black/20 backdrop-blur-sm border-0 p-0 cursor-default"
        onClick={onClose}
      />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.08]">
          <h2 className="font-heading font-bold text-lg text-[#1d1d1f]">
            {isNew ? `New ${config.label}` : `Edit ${config.label}`}
          </h2>
          <button type="button" onClick={onClose} className="text-[#aeaeb2] hover:text-[#1d1d1f] text-xl">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* ID field for text-id tables (editable on new, readonly on edit) */}
          {config.idType === 'text' && (
            <div>
              <label className={labelCls}>
                {config.idColumn}
                <span className="text-red-500 ml-0.5">*</span>
              </label>
              <input
                type="text"
                value={String(form[config.idColumn] ?? '')}
                onChange={(e) => setForm(f => ({ ...f, [config.idColumn]: e.target.value }))}
                readOnly={!isNew}
                className={inputCls + (!isNew ? ' opacity-60 cursor-not-allowed' : '')}
                placeholder={`Enter ${config.idColumn}`}
              />
            </div>
          )}

          {/* All columns */}
          {config.columns
            // Skip the idColumn for text-id (already rendered above); skip for uuid/int (hidden)
            .filter(col => col.name !== config.idColumn || (config.idType !== 'text' && config.idType !== 'uuid' && config.idType !== 'int'))
            .map(col => (
              <Field
                key={col.name}
                col={col}
                value={form[col.name]}
                onChange={handleChange}
                jsonError={jsonErrors[col.name] ?? ''}
                onJsonError={handleJsonError}
              />
            ))
          }

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-[10px] px-3 py-2">{error}</p>
          )}

          {/* Delete zone */}
          {!isNew && (
            <div className="pt-2 border-t border-black/[0.06]">
              {confirming ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-700">Delete this row?</span>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving}
                    className="px-4 py-1.5 rounded-[980px] text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Yes, delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="px-4 py-1.5 rounded-[980px] text-sm font-medium border border-black/[0.08] text-[#1d1d1f] hover:bg-[#f5f5f7]"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Delete this row
                </button>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-black/[0.08] flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-[980px] text-sm font-medium border border-black/[0.08] text-[#1d1d1f] hover:bg-[#f5f5f7]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-[980px] text-sm font-medium bg-[#800000] text-white hover:bg-[#a00000] disabled:opacity-50"
          >
            {saving ? 'Saving…' : isNew ? `Create` : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main DataTableManager ───────────────────────────────────────────────────

interface Props {
  config: DataTableConfig
}

const PAGE_SIZE = 50

export function DataTableManager({ config }: Props) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [page, setPage] = useState(0)
  const [state, setState] = useState<FetchState>({ rows: [], count: 0, loading: true, error: '' })
  const [drawer, setDrawer] = useState<DrawerState>({ open: false, row: null })
  const fetchCountRef = useRef(0)

  const fetchRows = useCallback(async (q: string, p: number) => {
    const id = ++fetchCountRef.current
    setState(prev => ({ ...prev, loading: true, error: '' }))
    try {
      const params = new URLSearchParams({ page: String(p) })
      if (q) params.set('search', q)
      const res = await fetch(`/api/admin/data/${config.table}?${params}`)
      if (id !== fetchCountRef.current) return
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setState(prev => ({ ...prev, loading: false, error: body.error ?? 'Failed to load' }))
        return
      }
      const { rows, count } = await res.json()
      setState({ rows: rows ?? [], count: count ?? 0, loading: false, error: '' })
    } catch {
      if (id !== fetchCountRef.current) return
      setState(prev => ({ ...prev, loading: false, error: 'Network error' }))
    }
  }, [config.table])

  useEffect(() => {
    setPage(0)
  }, [debouncedSearch])

  useEffect(() => {
    fetchRows(debouncedSearch, page)
  }, [debouncedSearch, page, fetchRows])

  const totalPages = Math.ceil(state.count / PAGE_SIZE)

  // Columns to show in table (idColumn + up to 4 searchColumns)
  const displayCols = [
    config.idColumn,
    ...config.searchColumns.filter(c => c !== config.idColumn),
  ].slice(0, 5)

  function openNew() {
    setDrawer({ open: true, row: null })
  }

  function openEdit(row: Row) {
    setDrawer({ open: true, row })
  }

  function closeDrawer() {
    setDrawer({ open: false, row: null })
  }

  function onSaved() {
    closeDrawer()
    fetchRows(debouncedSearch, page)
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[#1d1d1f] font-heading font-bold text-xl tracking-tight">{config.label}</h2>
            <p className="text-[#6e6e73] text-sm mt-0.5">
              {state.loading ? 'Loading…' : `${state.count} row${state.count !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            type="button"
            onClick={openNew}
            className="px-4 py-2 rounded-[980px] text-sm font-medium bg-[#800000] text-white hover:bg-[#a00000]"
          >
            + New
          </button>
        </div>

        {/* Search */}
        <div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search by ${config.searchColumns.join(', ')}…`}
            className="w-full max-w-sm px-3 py-2 rounded-[10px] border border-black/[0.08] text-sm bg-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#800000]/20 focus:border-[#800000] text-[#1d1d1f]"
          />
        </div>

        {/* Error */}
        {state.error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-[10px] px-3 py-2">{state.error}</p>
        )}

        {/* Table */}
        <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-[#f5f5f7] border-b border-black/[0.08]">
                <tr>
                  {displayCols.map(col => (
                    <th
                      key={col}
                      className="text-left px-4 py-3 text-[#6e6e73] text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                  <th className="px-4 py-3 w-14" />
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.05]">
                {state.loading && (
                  <tr>
                    <td colSpan={displayCols.length + 1} className="px-4 py-8 text-center text-[#6e6e73] text-sm">
                      Loading…
                    </td>
                  </tr>
                )}
                {!state.loading && state.rows.length === 0 && (
                  <tr>
                    <td colSpan={displayCols.length + 1} className="px-4 py-8 text-center text-[#6e6e73] text-sm">
                      No rows found.
                    </td>
                  </tr>
                )}
                {state.rows.map((row, idx) => (
                  <tr
                    key={String(row[config.idColumn] ?? idx)}
                    className="hover:bg-[#fafafa] cursor-pointer transition-colors"
                    onClick={() => openEdit(row)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openEdit(row) }}
                    role="button"
                    tabIndex={0}
                  >
                    {displayCols.map(col => (
                      <td key={col} className="px-4 py-3 text-[#1d1d1f] max-w-[200px]">
                        <span className="block truncate">
                          {row[col] == null
                            ? <span className="text-[#aeaeb2]">—</span>
                            : typeof row[col] === 'boolean'
                              ? (row[col] ? '✓' : '')
                              : typeof row[col] === 'object'
                                ? JSON.stringify(row[col])
                                : String(row[col])
                          }
                        </span>
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openEdit(row) }}
                        className="text-[#aeaeb2] hover:text-[#800000] text-xs px-1"
                        aria-label="Edit row"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-[#6e6e73]">
            <span>
              Page {page + 1} of {totalPages} ({state.count} rows)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-4 py-1.5 rounded-[980px] border border-black/[0.08] text-sm font-medium disabled:opacity-40 hover:bg-[#f5f5f7]"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-4 py-1.5 rounded-[980px] border border-black/[0.08] text-sm font-medium disabled:opacity-40 hover:bg-[#f5f5f7]"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Drawer */}
      {drawer.open && (
        <RowDrawer
          config={config}
          row={drawer.row}
          onClose={closeDrawer}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}
