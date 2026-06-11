'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AdmissionsUpdate } from '@/app/admin/updates/page'

interface Props {
  updates: AdmissionsUpdate[]
}

const EMPTY_FORM = {
  report_date: new Date().toISOString().slice(0, 10),
  severity: 'info',
  school_slug: '',
  school_name: '',
  title: '',
  body: '',
  action_required: '',
  event_date: '',
  event_type: '',
  sources_raw: '',
  verified: false,
}

function severityBadge(severity: string) {
  if (severity === 'urgent') return 'bg-red-100 text-red-700 border-red-200'
  if (severity === 'important') return 'bg-amber-100 text-amber-700 border-amber-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

function severityLabel(severity: string) {
  if (severity === 'urgent') return 'Urgent'
  if (severity === 'important') return 'Important'
  return 'Info'
}

function UpdateDrawer({
  update,
  onClose,
}: {
  update: AdmissionsUpdate | null
  onClose: () => void
}) {
  const [form, setForm] = useState(update ? {
    report_date: update.report_date,
    severity: update.severity,
    school_slug: update.school_slug ?? '',
    school_name: update.school_name ?? '',
    title: update.title,
    body: update.body,
    action_required: update.action_required ?? '',
    event_date: update.event_date ?? '',
    event_type: update.event_type ?? '',
    sources_raw: Array.isArray(update.sources) ? update.sources.join('\n') : '',
    verified: update.verified,
  } : EMPTY_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const router = useRouter()

  function set(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))
  }

  function setCheck(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [field]: e.target.checked }))
  }

  async function handleSave() {
    setError('')
    if (!form.title.trim() || !form.body.trim() || !form.report_date || !form.severity) {
      setError('Title, body, report date, and severity are required.')
      return
    }
    setSaving(true)
    const sources = form.sources_raw
      .split('\n')
      .flatMap(s => { const t = s.trim(); return t ? [t] : [] })
    const payload = {
      ...(update ? { id: update.id } : {}),
      report_date: form.report_date,
      severity: form.severity,
      school_slug: form.school_slug || null,
      school_name: form.school_name || null,
      title: form.title,
      body: form.body,
      action_required: form.action_required || null,
      event_date: form.event_date || null,
      event_type: form.event_type || null,
      sources,
      verified: form.verified,
    }
    const url = '/api/admin/updates'
    const method = update ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Something went wrong')
      return
    }
    router.refresh()
    onClose()
  }

  async function handleDelete() {
    if (!update) return
    setSaving(true)
    const res = await fetch(`/api/admin/updates?id=${encodeURIComponent(update.id)}`, { method: 'DELETE' })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Delete failed')
      return
    }
    router.refresh()
    onClose()
  }

  const inputCls = "w-full px-3 py-2 rounded-[10px] border border-black/[0.08] text-sm bg-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#800000]/20 focus:border-[#800000] text-[#1d1d1f]"
  const labelCls = "block text-[10px] font-semibold text-[#aeaeb2] uppercase tracking-wider mb-1"

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
            {update ? 'Edit Update' : 'New Admissions Update'}
          </h2>
          <button type="button" onClick={onClose} className="text-[#aeaeb2] hover:text-[#1d1d1f] text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Severity</label>
              <select value={form.severity} onChange={set('severity')} className={inputCls}>
                <option value="info">Info</option>
                <option value="important">Important</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Report Date</label>
              <input type="date" value={form.report_date} onChange={set('report_date')} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>School Slug</label>
              <input type="text" value={form.school_slug} onChange={set('school_slug')} className={inputCls} placeholder="e.g. ateneo-manila" />
            </div>
            <div>
              <label className={labelCls}>School Name</label>
              <input type="text" value={form.school_name} onChange={set('school_name')} className={inputCls} placeholder="e.g. Ateneo de Manila" />
            </div>
          </div>

          <div>
            <label className={labelCls}>Title</label>
            <input type="text" value={form.title} onChange={set('title')} className={inputCls} placeholder="Brief headline" />
          </div>

          <div>
            <label className={labelCls}>Body</label>
            <textarea value={form.body} onChange={set('body')} rows={4} className={inputCls} placeholder="Full update text" />
          </div>

          <div>
            <label className={labelCls}>Action Required</label>
            <input type="text" value={form.action_required} onChange={set('action_required')} className={inputCls} placeholder="e.g. Submit application before deadline" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Event Date</label>
              <input type="date" value={form.event_date} onChange={set('event_date')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Event Type</label>
              <input type="text" value={form.event_type} onChange={set('event_type')} className={inputCls} placeholder="e.g. application, exam" />
            </div>
          </div>

          <div>
            <label className={labelCls}>Sources (one URL per line)</label>
            <textarea
              value={form.sources_raw}
              onChange={set('sources_raw')}
              rows={3}
              className={inputCls + ' font-mono text-xs'}
              placeholder="https://example.com/announcement"
            />
          </div>

          <div className="pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.verified}
                onChange={setCheck('verified')}
                className="w-4 h-4 rounded accent-[#800000]"
              />
              <span className="text-sm text-[#1d1d1f]">Verified</span>
            </label>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-[10px] px-3 py-2">{error}</p>}

          {update && (
            <div className="pt-2 border-t border-black/[0.06]">
              {confirming ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-700">Delete this update?</span>
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
                  Delete this update
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
            {saving ? 'Saving…' : update ? 'Save Changes' : 'Create Update'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function UpdatesView({ updates }: Props) {
  const [drawerUpdate, setDrawerUpdate] = useState<AdmissionsUpdate | null | undefined>(undefined)
  // undefined = closed, null = new, AdmissionsUpdate = edit

  const isOpen = drawerUpdate !== undefined

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[#1d1d1f] font-heading font-bold text-xl tracking-tight">Admissions Updates</h2>
          <p className="text-[#6e6e73] text-sm mt-0.5">{updates.length} update{updates.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          type="button"
          onClick={() => setDrawerUpdate(null)}
          className="px-4 py-2 rounded-[980px] text-sm font-medium bg-[#800000] text-white hover:bg-[#a00000]"
        >
          + New Update
        </button>
      </div>

      <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-0 border-b border-[#f3f4f6] bg-[#f9fafb] px-4 py-2.5 text-[10px] font-semibold text-[#6e6e73] uppercase tracking-wider">
          <span className="pr-4">Severity</span>
          <span>Title / School</span>
          <span className="px-4">Event Date</span>
          <span className="px-4">Verified</span>
          <span />
        </div>

        {updates.length === 0 && (
          <div className="px-5 py-8 text-center text-[#6e6e73] text-sm">
            No admissions updates yet. Click &quot;+ New Update&quot; to create one.
          </div>
        )}

        {updates.map(u => (
          <div
            key={u.id}
            className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-0 items-center px-4 py-3 border-b border-[#f3f4f6] last:border-0 hover:bg-[#f9fafb] cursor-pointer"
            onClick={() => setDrawerUpdate(u)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setDrawerUpdate(u) }}
            role="button"
            tabIndex={0}
          >
            <span className="pr-4">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${severityBadge(u.severity)}`}>
                {severityLabel(u.severity)}
              </span>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#1d1d1f] truncate">{u.title}</p>
              {u.school_name && (
                <p className="text-[11px] text-[#6e6e73] truncate">{u.school_name}</p>
              )}
            </div>
            <span className="px-4 text-xs text-[#6e6e73] whitespace-nowrap">
              {u.event_date || '—'}
            </span>
            <span className="px-4 text-sm text-center">
              {u.verified ? '✓' : ''}
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setDrawerUpdate(u) }}
              className="text-[#aeaeb2] hover:text-[#800000] text-xs px-1"
              aria-label={`Edit ${u.title}`}
            >
              Edit
            </button>
          </div>
        ))}
      </div>

      {isOpen && (
        <UpdateDrawer
          update={drawerUpdate ?? null}
          onClose={() => setDrawerUpdate(undefined)}
        />
      )}
    </div>
  )
}
