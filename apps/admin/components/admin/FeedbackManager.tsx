'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ───────────────────────────────────────────────────────────────────

export interface AppFeedback {
  id: string
  user_id: string | null
  rating: number | null
  message: string | null
  status: 'new' | 'reviewed' | 'resolved'
  created_at: string
  updated_at: string
}

interface FetchState {
  rows: AppFeedback[]
  count: number
  loading: boolean
  error: string
}

type StatusTab = 'all' | 'new' | 'reviewed' | 'resolved'

const TABS: { key: StatusTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'resolved', label: 'Resolved' },
]

const PAGE_SIZE = 50

const pillBtnCls = 'px-3 py-1 rounded-[980px] text-xs font-medium border border-black/[0.08] text-ink hover:bg-surface-2 disabled:opacity-40'

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    new: 'bg-maroon/10 text-maroon',
    reviewed: 'bg-warning-soft text-warning-strong',
    resolved: 'bg-success-soft text-success-strong',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

function Stars({ rating }: { rating: number | null }) {
  const n = typeof rating === 'number' && rating >= 1 && rating <= 5 ? Math.round(rating) : 0
  if (!n) return <span className="text-ink-subtle">—</span>
  return (
    <span className="whitespace-nowrap" title={`${n} of 5`}>
      <span className="text-amber-500">{'★'.repeat(n)}</span>
      <span className="text-black/15">{'★'.repeat(5 - n)}</span>
      <span className="ml-1 text-[11px] text-ink-muted align-middle">{n}/5</span>
    </span>
  )
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

// ── Main FeedbackManager ────────────────────────────────────────────────────

export function FeedbackManager() {
  const [tab, setTab] = useState<StatusTab>('all')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [page, setPage] = useState(0)
  const [state, setState] = useState<FetchState>({ rows: [], count: 0, loading: true, error: '' })
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const fetchCountRef = useRef(0)

  const fetchRows = useCallback(async (status: StatusTab, q: string, p: number) => {
    const id = ++fetchCountRef.current
    setState(prev => ({ ...prev, loading: true, error: '' }))
    try {
      const params = new URLSearchParams({ page: String(p) })
      if (status !== 'all') params.set('status', status)
      if (q) params.set('q', q)
      const res = await fetch(`/api/admin/feedback?${params}`)
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
  }, [])

  useEffect(() => {
    setPage(0)
  }, [debouncedSearch, tab])

  useEffect(() => {
    fetchRows(tab, debouncedSearch, page)
  }, [tab, debouncedSearch, page, fetchRows])

  function refresh() {
    fetchRows(tab, debouncedSearch, page)
  }

  async function setFeedbackStatus(id: string, status: 'reviewed' | 'resolved') {
    setActionError('')
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setActionError(body.error ?? 'Failed to update status')
        return
      }
      refresh()
    } catch {
      setActionError('Network error')
    }
  }

  async function deleteFeedback(id: string) {
    setActionError('')
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setActionError(body.error ?? 'Failed to delete feedback')
        return
      }
      setConfirmingDelete(null)
      refresh()
    } catch {
      setActionError('Network error')
    }
  }

  const totalPages = Math.ceil(state.count / PAGE_SIZE)

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4">
        {/* Header */}
        <div>
          <h2 className="text-ink font-heading font-bold text-xl tracking-tight">Feedback</h2>
          <p className="text-ink-muted text-sm mt-0.5">
            {state.loading ? 'Loading…' : `${state.count} item${state.count !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Tabs + Search */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-surface-2 rounded-[980px] p-1">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`px-4 py-1.5 rounded-[980px] text-sm font-medium transition-colors ${
                  tab === key ? 'bg-white text-maroon shadow-sm' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="search"
            aria-label="Search feedback message"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search feedback message…"
            className="flex-1 min-w-[200px] max-w-sm px-3 py-2 rounded-[10px] border border-black/[0.08] text-sm bg-surface-3 focus:outline-none focus:ring-2 focus:ring-maroon/20 focus:border-maroon text-ink"
          />
        </div>

        {/* Errors */}
        {state.error ? (
          <p className="text-sm text-danger bg-danger-soft rounded-[10px] px-3 py-2">{state.error}</p>
        ) : null}
        {actionError ? (
          <p className="text-sm text-danger bg-danger-soft rounded-[10px] px-3 py-2">{actionError}</p>
        ) : null}

        {/* Table */}
        <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="bg-surface-2 border-b border-black/[0.08]">
                <tr>
                  <th className="text-left px-4 py-3 text-ink-muted text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Rating</th>
                  <th className="text-left px-4 py-3 text-ink-muted text-xs font-semibold uppercase tracking-wide">Message</th>
                  <th className="text-left px-4 py-3 text-ink-muted text-xs font-semibold uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-ink-muted text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Submitted</th>
                  <th className="px-4 py-3 text-right text-ink-muted text-xs font-semibold uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.05]">
                {state.loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-ink-muted text-sm">Loading…</td>
                  </tr>
                ) : null}
                {!state.loading && state.rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-ink-muted text-sm">No feedback found.</td>
                  </tr>
                ) : null}
                {state.rows.map((row) => {
                  const isExpanded = !!expanded[row.id]
                  const text = row.message || '—'
                  const needsTruncate = text.length > 120
                  return (
                    <tr key={row.id} className="hover:bg-surface-3 transition-colors align-top">
                      <td className="px-4 py-3"><Stars rating={row.rating} /></td>
                      <td className="px-4 py-3 text-ink max-w-[420px]">
                        <span className="block whitespace-pre-wrap break-words">
                          {isExpanded || !needsTruncate ? text : `${text.slice(0, 120)}…`}
                        </span>
                        {needsTruncate ? (
                          <button
                            type="button"
                            onClick={() => setExpanded(prev => ({ ...prev, [row.id]: !isExpanded }))}
                            className="text-xs text-maroon hover:underline mt-1"
                          >
                            {isExpanded ? 'Show less' : 'Show more'}
                          </button>
                        ) : null}
                      </td>
                      <td className="px-4 py-3"><StatusPill status={row.status} /></td>
                      <td className="px-4 py-3 text-ink-muted whitespace-nowrap">{formatDate(row.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5 justify-end">
                          {row.status !== 'reviewed' ? (
                            <button type="button" onClick={() => setFeedbackStatus(row.id, 'reviewed')} className={pillBtnCls}>
                              Reviewed
                            </button>
                          ) : null}
                          {row.status !== 'resolved' ? (
                            <button type="button" onClick={() => setFeedbackStatus(row.id, 'resolved')} className={pillBtnCls}>
                              Resolved
                            </button>
                          ) : null}
                          {confirmingDelete === row.id ? (
                            <span className="inline-flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => deleteFeedback(row.id)}
                                className="px-3 py-1 rounded-[980px] text-xs font-medium bg-danger text-white hover:bg-danger-strong"
                              >
                                Confirm
                              </button>
                              <button type="button" onClick={() => setConfirmingDelete(null)} className={pillBtnCls}>
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmingDelete(row.id)}
                              className="px-3 py-1 rounded-[980px] text-xs font-medium border border-danger/25 text-danger hover:bg-danger-soft"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 ? (
          <div className="flex items-center justify-between text-sm text-ink-muted">
            <span>Page {page + 1} of {totalPages} ({state.count} items)</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-4 py-1.5 rounded-[980px] border border-black/[0.08] text-sm font-medium disabled:opacity-40 hover:bg-surface-2"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-4 py-1.5 rounded-[980px] border border-black/[0.08] text-sm font-medium disabled:opacity-40 hover:bg-surface-2"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
