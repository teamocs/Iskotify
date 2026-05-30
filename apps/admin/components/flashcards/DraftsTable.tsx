'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

interface Draft {
  topic_id: string
  topic_name: string
  subject_id: string | null
  subject_name: string
  source_type: 'csv' | 'pdf' | 'manual' | 'ai'
  created_at: string
  total_cards: number
  cards_with_options: number
  cards_enhanced: number
  cards_needing_enhancement: number
}

export function DraftsTable() {
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function fetchDrafts() {
    try {
      const res = await fetch('/api/flashcards/drafts')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to load drafts')
      setDrafts(body.drafts)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load drafts')
    }
  }

  useEffect(() => {
    fetchDrafts()
    const iv = setInterval(() => {
      // Only poll when at least one draft still has pending enhancement
      setDrafts(curr => {
        const stillPending = curr?.some(d => d.cards_needing_enhancement > 0)
        if (stillPending) fetchDrafts()
        return curr ?? null
      })
    }, 5000)
    return () => clearInterval(iv)
  }, [])

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">
        {error}
      </div>
    )
  }
  if (drafts === null) {
    return (
      <div className="rounded-xl border border-black/[0.08] bg-white px-6 py-12 text-center text-[#6e6e73] text-sm">
        Loading drafts…
      </div>
    )
  }
  if (drafts.length === 0) {
    return (
      <div className="rounded-2xl border border-black/[0.08] bg-white px-6 py-16 text-center shadow-sm">
        <div className="text-4xl mb-3">📥</div>
        <div className="text-[#1d1d1f] font-semibold font-heading mb-1">No drafts</div>
        <div className="text-[#6e6e73] text-sm">Import a CSV to get started.</div>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-black/[0.08] bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-[#f5f5f7] text-[#6e6e73]">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium uppercase tracking-wider text-[11px]">Subject</th>
            <th className="px-4 py-2.5 text-left font-medium uppercase tracking-wider text-[11px]">Topic</th>
            <th className="px-4 py-2.5 text-left font-medium uppercase tracking-wider text-[11px]">Cards</th>
            <th className="px-4 py-2.5 text-left font-medium uppercase tracking-wider text-[11px]">Enhancement</th>
            <th className="px-4 py-2.5 text-left font-medium uppercase tracking-wider text-[11px]">Source</th>
            <th className="px-4 py-2.5 text-left font-medium uppercase tracking-wider text-[11px]">Created</th>
            <th className="px-4 py-2.5 text-right font-medium uppercase tracking-wider text-[11px]">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/[0.06]">
          {drafts.map(d => (
            <tr key={d.topic_id} className="hover:bg-[#fafafb]">
              <td className="px-4 py-3 text-[#6e6e73]">{d.subject_name}</td>
              <td className="px-4 py-3 text-[#1d1d1f] font-medium">{d.topic_name}</td>
              <td className="px-4 py-3 text-[#1d1d1f]">{d.total_cards}</td>
              <td className="px-4 py-3">
                <EnhancementCell draft={d} />
              </td>
              <td className="px-4 py-3">
                <SourceBadge source={d.source_type} />
              </td>
              <td className="px-4 py-3 text-[#6e6e73] text-xs">{relTime(d.created_at)}</td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/admin/flashcards/review/${d.topic_id}`}
                  className="inline-flex items-center rounded-[980px] bg-[#800000] hover:bg-[#9a0a1f] text-white px-3 py-1.5 text-xs font-medium transition-colors shadow-sm"
                >
                  Review & Publish
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EnhancementCell({ draft }: { draft: Draft }) {
  const ready = draft.cards_with_options + draft.cards_enhanced
  if (draft.cards_needing_enhancement === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-green-700 text-xs font-medium">
        <span>✓</span> Complete ({ready}/{draft.total_cards})
      </span>
    )
  }
  const pct = Math.round((ready / draft.total_cards) * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 bg-black/[0.08] rounded-full overflow-hidden">
        <div className="h-full bg-[#800000] transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[#6e6e73] text-xs tabular-nums">{ready}/{draft.total_cards}</span>
    </div>
  )
}

function SourceBadge({ source }: { source: Draft['source_type'] }) {
  const map: Record<Draft['source_type'], string> = {
    csv: 'bg-blue-100 text-blue-800',
    pdf: 'bg-amber-100 text-amber-800',
    manual: 'bg-gray-100 text-gray-700',
    ai: 'bg-purple-100 text-purple-800',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${map[source]}`}>
      {source.toUpperCase()}
    </span>
  )
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}
