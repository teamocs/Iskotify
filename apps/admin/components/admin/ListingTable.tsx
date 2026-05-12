'use client'

import { useState } from 'react'
import type { Listing } from '@iskotify/utils'
import { ListingDrawer } from './ListingDrawer'
import { ConfirmDialog } from './ConfirmDialog'
import { useRouter } from 'next/navigation'

const TYPE_FILTERS = ['All', 'Scholarships', 'Exams', 'Active', 'Upcoming', 'Closed'] as const

const TYPE_STYLE: Record<string, string> = {
  scholarship: 'bg-[#fef2f2] text-[#800000]',
  exam:        'bg-[#eff6ff] text-[#1e3a8a]'
}

const STATUS_STYLE: Record<string, string> = {
  active:   'bg-green-100 text-green-800',
  upcoming: 'bg-amber-100 text-amber-800',
  closed:   'bg-gray-100 text-gray-500'
}

export function ListingTable({ listings }: { listings: Listing[] }) {
  const [filter, setFilter] = useState('All')
  const [drawerListing, setDrawerListing] = useState<Listing | null | 'new'>(null)
  const [deleteTarget, setDeleteTarget] = useState<Listing | null>(null)
  const router = useRouter()

  const filtered = listings.filter(l => {
    if (filter === 'Scholarships') return l.type === 'scholarship'
    if (filter === 'Exams') return l.type === 'exam'
    if (filter === 'Active') return l.status === 'active'
    if (filter === 'Upcoming') return l.status === 'upcoming'
    if (filter === 'Closed') return l.status === 'closed'
    return true
  })

  async function handleDelete(listing: Listing) {
    await fetch(`/api/admin/listings/${listing.id}`, { method: 'DELETE' })
    setDeleteTarget(null)
    router.refresh()
  }

  return (
    <>
      <div className="bg-white rounded-[16px] border border-black/[0.05] shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-black/[0.05] flex-wrap">
          <p className="font-heading font-bold text-[15px] text-[#1d1d1f] flex-1">Listings</p>
          {TYPE_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-[980px] px-3 py-1 text-[11px] font-medium transition-colors ${
                filter === f
                  ? 'bg-[#fef2f2] text-[#800000] border border-[rgba(128,0,0,0.2)]'
                  : 'bg-[#f5f5f7] text-[#6e6e73] border border-transparent'
              }`}
            >
              {f}
            </button>
          ))}
          <button
            onClick={() => setDrawerListing('new')}
            className="rounded-[980px] px-4 py-1.5 text-[11px] font-medium bg-[#1d1d1f] text-white hover:bg-[#3a3a3c] transition-colors"
          >
            + Add Listing
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#fafafa]">
                {['Name', 'Type', 'Status', 'Region', 'Deadline', ''].map(h => (
                  <th key={h} className="px-5 py-2 text-left text-[10px] font-semibold text-[#aeaeb2] uppercase tracking-wider border-b border-black/[0.05]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id} className="hover:bg-black/[0.015] transition-colors">
                  <td className="px-5 py-2.5 border-b border-black/[0.04]">
                    <p className="text-[13px] font-medium text-[#1d1d1f]">{l.title}</p>
                    <p className="text-[11px] text-[#aeaeb2]">{l.provider}</p>
                  </td>
                  <td className="px-5 py-2.5 border-b border-black/[0.04]">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${TYPE_STYLE[l.type]}`}>{l.type}</span>
                  </td>
                  <td className="px-5 py-2.5 border-b border-black/[0.04]">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLE[l.status]}`}>{l.status}</span>
                  </td>
                  <td className="px-5 py-2.5 border-b border-black/[0.04] text-[12px] text-[#6e6e73]">{l.region || '—'}</td>
                  <td className="px-5 py-2.5 border-b border-black/[0.04] text-[12px] text-[#6e6e73]">
                    {l.deadline ? new Date(l.deadline).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </td>
                  <td className="px-5 py-2.5 border-b border-black/[0.04]">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setDrawerListing(l)}
                        className="w-7 h-7 rounded-lg bg-[#f5f5f7] border border-black/[0.08] flex items-center justify-center text-sm hover:bg-[#e5e5ea] transition-colors"
                        title="Edit"
                      >✏️</button>
                      <button
                        onClick={() => setDeleteTarget(l)}
                        className="w-7 h-7 rounded-lg bg-[#f5f5f7] border border-black/[0.08] flex items-center justify-center text-sm hover:bg-red-50 transition-colors"
                        title="Delete"
                      >🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-[#aeaeb2]">No listings match this filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {drawerListing !== null && (
        <ListingDrawer
          listing={drawerListing === 'new' ? null : drawerListing}
          onClose={() => setDrawerListing(null)}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          message={`Delete "${deleteTarget.title}"? This cannot be undone.`}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  )
}
