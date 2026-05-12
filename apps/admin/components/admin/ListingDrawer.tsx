'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Listing } from '@iskotify/utils'

interface Props {
  listing: Listing | null   // null = new listing
  onClose: () => void
}

const EMPTY = {
  type: 'scholarship', title: '', slug: '', provider: '', description: '',
  coverage: '', deadline: '', exam_date: '', region: '', status: 'active',
  grant_amount: '', external_url: ''
}

export function ListingDrawer({ listing, onClose }: Props) {
  const [form, setForm] = useState(listing ? {
    type: listing.type,
    title: listing.title,
    slug: listing.slug,
    provider: listing.provider,
    description: listing.description ?? '',
    coverage: listing.coverage ?? '',
    deadline: listing.deadline ?? '',
    exam_date: listing.exam_date ?? '',
    region: listing.region ?? '',
    status: listing.status,
    grant_amount: listing.grant_amount?.toString() ?? '',
    external_url: listing.external_url ?? ''
  } : EMPTY)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  function set(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const payload = {
      ...form,
      grant_amount: form.grant_amount ? Number(form.grant_amount) : null,
      deadline: form.deadline || null,
      exam_date: form.exam_date || null
    }
    const url = listing ? `/api/admin/listings/${listing.id}` : '/api/admin/listings'
    const method = listing ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
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

  const inputCls = "w-full px-3 py-2 rounded-[10px] border border-black/[0.08] text-sm bg-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#800000]/20 focus:border-[#800000] text-[#1d1d1f]"
  const labelCls = "block text-[10px] font-semibold text-[#aeaeb2] uppercase tracking-wider mb-1"

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="flex-1 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.08]">
          <h2 className="font-heading font-bold text-lg text-[#1d1d1f]">
            {listing ? 'Edit Listing' : 'Add Listing'}
          </h2>
          <button onClick={onClose} className="text-[#aeaeb2] hover:text-[#1d1d1f] text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Type</label>
              <select value={form.type} onChange={set('type')} className={inputCls}>
                <option value="scholarship">Scholarship</option>
                <option value="exam">Exam</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status} onChange={set('status')} className={inputCls}>
                <option value="active">Active</option>
                <option value="upcoming">Upcoming</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>
          {([
            ['title', 'Title', 'text'],
            ['slug', 'Slug', 'text'],
            ['provider', 'Provider / Org', 'text'],
            ['region', 'Region', 'text'],
            ['external_url', 'External URL', 'url'],
            ['deadline', 'Deadline', 'date'],
            ['exam_date', 'Exam Date', 'date'],
            ['grant_amount', 'Grant Amount (₱)', 'number']
          ] as [string, string, string][]).map(([field, label, type]) => (
            <div key={field}>
              <label className={labelCls}>{label}</label>
              <input type={type} value={(form as any)[field]} onChange={set(field)} className={inputCls} />
            </div>
          ))}
          <div>
            <label className={labelCls}>Description</label>
            <textarea value={form.description} onChange={set('description')} rows={3} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Coverage</label>
            <textarea value={form.coverage} onChange={set('coverage')} rows={2} className={inputCls} />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-[10px] px-3 py-2">{error}</p>}
        </form>
        <div className="px-6 py-4 border-t border-black/[0.08] flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-5 py-2 rounded-[980px] text-sm font-medium border border-black/[0.08] text-[#1d1d1f] hover:bg-[#f5f5f7]">
            Cancel
          </button>
          <button onClick={handleSubmit as any} disabled={saving} className="px-5 py-2 rounded-[980px] text-sm font-medium bg-[#800000] text-white hover:bg-[#a00000] disabled:opacity-50">
            {saving ? 'Saving…' : listing ? 'Save Changes' : 'Create Listing'}
          </button>
        </div>
      </div>
    </div>
  )
}
