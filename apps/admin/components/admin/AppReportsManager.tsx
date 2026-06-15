'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ───────────────────────────────────────────────────────────────────

export interface AppBugReport {
  id: string
  user_id: string | null
  screen: string | null
  description: string | null
  image_url: string | null
  app_version: string | null
  platform: string | null
  status: 'new' | 'reviewed' | 'resolved'
  created_at: string
  updated_at: string
}

interface FetchState {
  rows: AppBugReport[]
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

const pillBtnCls = 'px-3 py-1 rounded-[980px] text-xs font-medium border border-black/[0.08] text-[#1d1d1f] hover:bg-[#f5f5f7] disabled:opacity-40'

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
    new: 'bg-[#800000]/10 text-[#800000]',
    reviewed: 'bg-amber-100 text-amber-800',
    resolved: 'bg-green-100 text-green-800',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

function PlatformBadge({ platform }: { platform: string | null }) {
  if (!platform) return <span className="text-[#aeaeb2]">—</span>
  const p = platform.toLowerCase()
  const isIos = p === 'ios'
  const isAndroid = p === 'android'
  const cls = isIos
    ? 'bg-gray-100 text-gray-800'
    : isAndroid
      ? 'bg-green-100 text-green-800'
      : 'bg-blue-100 text-blue-800'
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${cls}`}>
      {platform}
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

// ── Main AppReportsManager ──────────────────────────────────────────────────

export function AppReportsManager() {
  const [tab, setTab] = useState<StatusTab>('all')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [page, setPage] = useState(0)
  const [state, setState] = useState<FetchState>({ rows: [], count: 0, loading: true, error: '' })
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)
  const fetchCountRef = useRef(0)

  const fetchRows = useCallback(async (status: StatusTab, q: string, p: number) => {
    const id = ++fetchCountRef.current
    setState(prev => ({ ...prev, loading: true, error: '' }))
    try {
      const params = new URLSearchParams({ page: String(p) })
      if (status !== 'all') params.set('status', status)
      if (q) params.set('q', q)
      const res = await fetch(`/api/admin/app-reports?${params}`)
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

  async function setReportStatus(id: string, status: 'reviewed' | 'resolved') {
    setActionError('')
    try {
      const res = await fetch(`/api/admin/app-reports/${id}`, {
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

  async function deleteReport(id: string) {
    setActionError('')
    try {
      const res = await fetch(`/api/admin/app-reports/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setActionError(body.error ?? 'Failed to delete report')
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
          <h2 className="text-[#1d1d1f] font-heading font-bold text-xl tracking-tight">Bug Reports</h2>
          <p className="text-[#6e6e73] text-sm mt-0.5">
            {state.loading ? 'Loading…' : `${state.count} report${state.count !== 1 ? 's' : ''}`}
          </p>
        </div>

        {/* Tabs + Search */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-[#f5f5f7] rounded-[980px] p-1">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`px-4 py-1.5 rounded-[980px] text-sm font-medium transition-colors ${
                  tab === key ? 'bg-white text-[#800000] shadow-sm' : 'text-[#6e6e73] hover:text-[#1d1d1f]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search screen or description…"
            className="flex-1 min-w-[200px] max-w-sm px-3 py-2 rounded-[10px] border border-black/[0.08] text-sm bg-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#800000]/20 focus:border-[#800000] text-[#1d1d1f]"
          />
        </div>

        {/* Errors */}
        {state.error ? (
          <p className="text-sm text-red-600 bg-red-50 rounded-[10px] px-3 py-2">{state.error}</p>
        ) : null}
        {actionError ? (
          <p className="text-sm text-red-600 bg-red-50 rounded-[10px] px-3 py-2">{actionError}</p>
        ) : null}

        {/* Table */}
        <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead className="bg-[#f5f5f7] border-b border-black/[0.08]">
                <tr>
                  <th className="text-left px-4 py-3 text-[#6e6e73] text-xs font-semibold uppercase tracking-wide">Screen</th>
                  <th className="text-left px-4 py-3 text-[#6e6e73] text-xs font-semibold uppercase tracking-wide">Description</th>
                  <th className="text-left px-4 py-3 text-[#6e6e73] text-xs font-semibold uppercase tracking-wide">Shot</th>
                  <th className="text-left px-4 py-3 text-[#6e6e73] text-xs font-semibold uppercase tracking-wide">Platform / Version</th>
                  <th className="text-left px-4 py-3 text-[#6e6e73] text-xs font-semibold uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-[#6e6e73] text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Reported</th>
                  <th className="px-4 py-3 text-right text-[#6e6e73] text-xs font-semibold uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.05]">
                {state.loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[#6e6e73] text-sm">Loading…</td>
                  </tr>
                ) : null}
                {!state.loading && state.rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-[#6e6e73] text-sm">No bug reports found.</td>
                  </tr>
                ) : null}
                {state.rows.map((row) => {
                  const isExpanded = !!expanded[row.id]
                  const text = row.description || '—'
                  const needsTruncate = text.length > 100
                  return (
                    <tr key={row.id} className="hover:bg-[#fafafa] transition-colors align-top">
                      <td className="px-4 py-3 text-[#1d1d1f] max-w-[160px]">
                        <span className="block whitespace-pre-wrap break-words font-medium">{row.screen || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-[#1d1d1f] max-w-[320px]">
                        <span className="block whitespace-pre-wrap break-words">
                          {isExpanded || !needsTruncate ? text : `${text.slice(0, 100)}…`}
                        </span>
                        {needsTruncate ? (
                          <button
                            type="button"
                            onClick={() => setExpanded(prev => ({ ...prev, [row.id]: !isExpanded }))}
                            className="text-xs text-[#800000] hover:underline mt-1"
                          >
                            {isExpanded ? 'Show less' : 'Show more'}
                          </button>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {row.image_url ? (
                          <button
                            type="button"
                            onClick={() => setLightbox(row.image_url)}
                            className="block w-12 h-12 rounded-lg overflow-hidden border border-black/[0.08] bg-[#f5f5f7] hover:ring-2 hover:ring-[#800000]/30"
                            title="View screenshot"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={row.image_url} alt="Screenshot thumbnail" className="w-full h-full object-cover" />
                          </button>
                        ) : (
                          <span className="text-[#aeaeb2]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <PlatformBadge platform={row.platform} />
                        <span className="block text-[11px] text-[#6e6e73] mt-1 font-mono">{row.app_version || '—'}</span>
                      </td>
                      <td className="px-4 py-3"><StatusPill status={row.status} /></td>
                      <td className="px-4 py-3 text-[#6e6e73] whitespace-nowrap">{formatDate(row.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5 justify-end">
                          {row.status !== 'reviewed' ? (
                            <button type="button" onClick={() => setReportStatus(row.id, 'reviewed')} className={pillBtnCls}>
                              Reviewed
                            </button>
                          ) : null}
                          {row.status !== 'resolved' ? (
                            <button type="button" onClick={() => setReportStatus(row.id, 'resolved')} className={pillBtnCls}>
                              Resolved
                            </button>
                          ) : null}
                          {confirmingDelete === row.id ? (
                            <span className="inline-flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => deleteReport(row.id)}
                                className="px-3 py-1 rounded-[980px] text-xs font-medium bg-red-600 text-white hover:bg-red-700"
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
                              className="px-3 py-1 rounded-[980px] text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50"
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
          <div className="flex items-center justify-between text-sm text-[#6e6e73]">
            <span>Page {page + 1} of {totalPages} ({state.count} reports)</span>
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
        ) : null}
      </div>

      {/* Screenshot lightbox */}
      {lightbox ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <button
            type="button"
            aria-label="Close screenshot"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm border-0 p-0 cursor-default"
            onClick={() => setLightbox(null)}
          />
          <div className="relative max-w-2xl max-h-[85vh] flex flex-col">
            <a
              href={lightbox}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute -top-7 right-0 text-xs text-white/80 hover:text-white"
            >
              Open original ↗
            </a>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox} alt="Bug report screenshot" className="rounded-2xl shadow-2xl object-contain max-h-[85vh]" />
          </div>
        </div>
      ) : null}
    </div>
  )
}
