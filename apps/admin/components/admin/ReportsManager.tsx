'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ───────────────────────────────────────────────────────────────────

export interface QuestionReport {
  id: string
  question_id: string
  source_table: 'flashcards' | 'upcat_questions'
  question_text: string
  reason: string
  user_id: string | null
  status: 'new' | 'reviewed' | 'resolved'
  created_at: string
  updated_at: string
}

interface FlashcardQuestion {
  id: string
  question: string | null
  answer: string | null
  explanation: string | null
}

interface UpcatQuestion {
  question_id: string
  question_text: string
  options: string[]
  correct_index: number
  explanation: string
  status: string
}

interface FetchState {
  rows: QuestionReport[]
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

const inputCls = 'w-full px-3 py-2 rounded-[10px] border border-black/[0.08] text-sm bg-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#800000]/20 focus:border-[#800000] text-[#1d1d1f]'
const labelCls = 'block text-[10px] font-semibold text-[#aeaeb2] uppercase tracking-wider mb-1'
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

function SourceBadge({ source }: { source: string }) {
  const isUpcat = source === 'upcat_questions'
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${isUpcat ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
      {isUpcat ? 'UPCAT' : 'Flashcard'}
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

// ── Question Editor Drawer ──────────────────────────────────────────────────

interface EditorProps {
  report: QuestionReport
  onClose: () => void
  onResolved: () => void
}

function QuestionEditorDrawer({ report, onClose, onResolved }: EditorProps) {
  const isUpcat = report.source_table === 'upcat_questions'
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Flashcard fields
  const [fcQuestion, setFcQuestion] = useState('')
  const [fcAnswer, setFcAnswer] = useState('')
  const [fcExplanation, setFcExplanation] = useState('')

  // UPCAT fields
  const [uqText, setUqText] = useState('')
  const [uqOptions, setUqOptions] = useState<string[]>(['', '', '', ''])
  const [uqCorrectIndex, setUqCorrectIndex] = useState(0)
  const [uqExplanation, setUqExplanation] = useState('')
  const [uqStatus, setUqStatus] = useState('published')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/admin/reports/${report.id}`)
        if (cancelled) return
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setError(body.error ?? 'Failed to load question')
          setLoading(false)
          return
        }
        const { question } = await res.json()
        if (cancelled) return
        if (!question) {
          setMissing(true)
          setLoading(false)
          return
        }
        if (report.source_table === 'upcat_questions') {
          const q = question as UpcatQuestion
          setUqText(q.question_text ?? '')
          setUqOptions(Array.isArray(q.options) && q.options.length >= 4 ? q.options : ['', '', '', ''])
          setUqCorrectIndex(typeof q.correct_index === 'number' ? q.correct_index : 0)
          setUqExplanation(q.explanation ?? '')
          setUqStatus(q.status === 'draft' ? 'draft' : 'published')
        } else {
          const q = question as FlashcardQuestion
          setFcQuestion(q.question ?? '')
          setFcAnswer(q.answer ?? '')
          setFcExplanation(q.explanation ?? '')
        }
        setLoading(false)
      } catch {
        if (!cancelled) {
          setError('Network error')
          setLoading(false)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [report.id, report.source_table])

  async function handleSave() {
    setError('')
    setSaved(false)
    if (isUpcat) {
      if (!uqText.trim()) { setError('Question text cannot be empty.'); return }
      if (uqOptions.length < 4 || uqOptions.some(o => !o.trim())) {
        setError('All options must be filled in (minimum 4).')
        return
      }
      if (uqCorrectIndex < 0 || uqCorrectIndex >= uqOptions.length || uqCorrectIndex > 3) {
        setError('Correct answer must point to one of the first 4 options.')
        return
      }
    } else {
      if (!fcQuestion.trim()) { setError('Question cannot be empty.'); return }
      if (!fcAnswer.trim()) { setError('Answer cannot be empty.'); return }
    }

    setSaving(true)
    try {
      const res = isUpcat
        ? await fetch(`/api/upcat-questions/${encodeURIComponent(report.question_id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question_text: uqText,
              options: uqOptions,
              correct_index: uqCorrectIndex,
              explanation: uqExplanation,
              status: uqStatus,
            }),
          })
        : await fetch(`/api/flashcards/cards/${encodeURIComponent(report.question_id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question: fcQuestion,
              answer: fcAnswer,
              explanation: fcExplanation,
            }),
          })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Save failed')
        return
      }
      setSaved(true)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteQuestion() {
    setError('')
    setSaving(true)
    try {
      const url = isUpcat
        ? `/api/upcat-questions/${encodeURIComponent(report.question_id)}`
        : `/api/flashcards/cards/${encodeURIComponent(report.question_id)}`
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Delete failed')
        return
      }
      setMissing(true)
      setConfirmingDelete(false)
      setSaved(true)
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleMarkResolved() {
    setError('')
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/reports/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Failed to mark resolved')
        return
      }
      onResolved()
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
          <div>
            <h2 className="font-heading font-bold text-lg text-[#1d1d1f]">Edit Question</h2>
            <div className="flex items-center gap-2 mt-1">
              <SourceBadge source={report.source_table} />
              <span className="text-[11px] text-[#aeaeb2] font-mono">{report.question_id}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-[#aeaeb2] hover:text-[#1d1d1f] text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Report context */}
          <div className="bg-[#f5f5f7] rounded-[10px] px-3 py-2">
            <p className="text-[10px] font-semibold text-[#aeaeb2] uppercase tracking-wider mb-0.5">Reported reason</p>
            <p className="text-sm text-[#1d1d1f]">{report.reason || '—'}</p>
          </div>

          {loading ? (
            <p className="text-sm text-[#6e6e73]">Loading question…</p>
          ) : missing ? (
            <p className="text-sm text-amber-800 bg-amber-50 rounded-[10px] px-3 py-2">
              This question no longer exists. Snapshot at report time: “{report.question_text || '—'}”
            </p>
          ) : isUpcat ? (
            <>
              <div>
                <label className={labelCls}>Question Text</label>
                <textarea value={uqText} onChange={(e) => setUqText(e.target.value)} rows={3} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Options (correct answer selected)</label>
                <div className="space-y-2">
                  {uqOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correct-option"
                        checked={uqCorrectIndex === i}
                        onChange={() => setUqCorrectIndex(i)}
                        disabled={i > 3}
                        className="accent-[#800000] flex-shrink-0"
                        aria-label={`Mark option ${i + 1} correct`}
                      />
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const next = [...uqOptions]
                          next[i] = e.target.value
                          setUqOptions(next)
                        }}
                        className={inputCls}
                        placeholder={`Option ${i + 1}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Explanation</label>
                <textarea value={uqExplanation} onChange={(e) => setUqExplanation(e.target.value)} rows={3} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select value={uqStatus} onChange={(e) => setUqStatus(e.target.value)} className={inputCls}>
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className={labelCls}>Question</label>
                <textarea value={fcQuestion} onChange={(e) => setFcQuestion(e.target.value)} rows={3} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Answer</label>
                <textarea value={fcAnswer} onChange={(e) => setFcAnswer(e.target.value)} rows={2} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Explanation</label>
                <textarea value={fcExplanation} onChange={(e) => setFcExplanation(e.target.value)} rows={3} className={inputCls} />
              </div>
            </>
          )}

          {error ? (
            <p className="text-sm text-red-600 bg-red-50 rounded-[10px] px-3 py-2">{error}</p>
          ) : null}
          {saved ? (
            <p className="text-sm text-green-700 bg-green-50 rounded-[10px] px-3 py-2">
              Saved. You can mark this report resolved below.
            </p>
          ) : null}

          {/* Delete question zone */}
          {!loading && !missing ? (
            <div className="pt-2 border-t border-black/[0.06]">
              {confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-700">Delete this question permanently?</span>
                  <button
                    type="button"
                    onClick={handleDeleteQuestion}
                    disabled={saving}
                    className="px-4 py-1.5 rounded-[980px] text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Yes, delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="px-4 py-1.5 rounded-[980px] text-sm font-medium border border-black/[0.08] text-[#1d1d1f] hover:bg-[#f5f5f7]"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Delete this question
                </button>
              )}
            </div>
          ) : null}
        </div>

        <div className="px-6 py-4 border-t border-black/[0.08] flex gap-2 justify-end">
          <button
            type="button"
            onClick={handleMarkResolved}
            disabled={saving}
            className="px-5 py-2 rounded-[980px] text-sm font-medium border border-green-600/30 text-green-700 hover:bg-green-50 disabled:opacity-50 mr-auto"
          >
            ✓ Mark resolved
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-[980px] text-sm font-medium border border-black/[0.08] text-[#1d1d1f] hover:bg-[#f5f5f7]"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading || missing}
            className="px-5 py-2 rounded-[980px] text-sm font-medium bg-[#800000] text-white hover:bg-[#a00000] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Question'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ReportsManager ─────────────────────────────────────────────────────

export function ReportsManager() {
  const [tab, setTab] = useState<StatusTab>('all')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [page, setPage] = useState(0)
  const [state, setState] = useState<FetchState>({ rows: [], count: 0, loading: true, error: '' })
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [editing, setEditing] = useState<QuestionReport | null>(null)
  const fetchCountRef = useRef(0)

  const fetchRows = useCallback(async (status: StatusTab, q: string, p: number) => {
    const id = ++fetchCountRef.current
    setState(prev => ({ ...prev, loading: true, error: '' }))
    try {
      const params = new URLSearchParams({ page: String(p) })
      if (status !== 'all') params.set('status', status)
      if (q) params.set('q', q)
      const res = await fetch(`/api/admin/reports?${params}`)
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
      const res = await fetch(`/api/admin/reports/${id}`, {
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
      const res = await fetch(`/api/admin/reports/${id}`, { method: 'DELETE' })
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
          <h2 className="text-[#1d1d1f] font-heading font-bold text-xl tracking-tight">Reported Questions</h2>
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
            placeholder="Search question text or reason…"
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
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-[#f5f5f7] border-b border-black/[0.08]">
                <tr>
                  <th className="text-left px-4 py-3 text-[#6e6e73] text-xs font-semibold uppercase tracking-wide">Question</th>
                  <th className="text-left px-4 py-3 text-[#6e6e73] text-xs font-semibold uppercase tracking-wide">Source</th>
                  <th className="text-left px-4 py-3 text-[#6e6e73] text-xs font-semibold uppercase tracking-wide">Reason</th>
                  <th className="text-left px-4 py-3 text-[#6e6e73] text-xs font-semibold uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-[#6e6e73] text-xs font-semibold uppercase tracking-wide whitespace-nowrap">Reported</th>
                  <th className="px-4 py-3 text-right text-[#6e6e73] text-xs font-semibold uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.05]">
                {state.loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[#6e6e73] text-sm">Loading…</td>
                  </tr>
                ) : null}
                {!state.loading && state.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[#6e6e73] text-sm">No reports found.</td>
                  </tr>
                ) : null}
                {state.rows.map((row) => {
                  const isExpanded = !!expanded[row.id]
                  const text = row.question_text || '—'
                  const needsTruncate = text.length > 100
                  return (
                    <tr key={row.id} className="hover:bg-[#fafafa] transition-colors align-top">
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
                      <td className="px-4 py-3"><SourceBadge source={row.source_table} /></td>
                      <td className="px-4 py-3 text-[#1d1d1f] max-w-[220px]">
                        <span className="block whitespace-pre-wrap break-words">{row.reason || '—'}</span>
                      </td>
                      <td className="px-4 py-3"><StatusPill status={row.status} /></td>
                      <td className="px-4 py-3 text-[#6e6e73] whitespace-nowrap">{formatDate(row.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => setEditing(row)}
                            className="px-3 py-1 rounded-[980px] text-xs font-medium bg-[#800000] text-white hover:bg-[#a00000]"
                          >
                            Edit question
                          </button>
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

      {/* Question editor drawer */}
      {editing ? (
        <QuestionEditorDrawer
          report={editing}
          onClose={() => { setEditing(null); refresh() }}
          onResolved={() => { setEditing(null); refresh() }}
        />
      ) : null}
    </div>
  )
}
