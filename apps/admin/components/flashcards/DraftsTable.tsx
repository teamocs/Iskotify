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
    return <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-300 text-sm">{error}</div>
  }
  if (drafts === null) {
    return <div className="text-white/40 text-sm">Loading drafts…</div>
  }
  if (drafts.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] px-6 py-12 text-center">
        <div className="text-3xl mb-2">📥</div>
        <div className="text-white font-semibold mb-1">No drafts</div>
        <div className="text-white/40 text-sm">Import a CSV to get started.</div>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="min-w-full text-sm">
        <thead className="bg-white/[0.04] text-white/60">
          <tr>
            <th className="px-3 py-2 text-left">Subject</th>
            <th className="px-3 py-2 text-left">Topic</th>
            <th className="px-3 py-2 text-left">Cards</th>
            <th className="px-3 py-2 text-left">Enhancement</th>
            <th className="px-3 py-2 text-left">Source</th>
            <th className="px-3 py-2 text-left">Created</th>
            <th className="px-3 py-2 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {drafts.map(d => (
            <tr key={d.topic_id} className="odd:bg-white/[0.02]">
              <td className="px-3 py-2 text-white/80">{d.subject_name}</td>
              <td className="px-3 py-2 text-white">{d.topic_name}</td>
              <td className="px-3 py-2">{d.total_cards}</td>
              <td className="px-3 py-2">
                <EnhancementCell draft={d} />
              </td>
              <td className="px-3 py-2">
                <SourceBadge source={d.source_type} />
              </td>
              <td className="px-3 py-2 text-white/40 text-xs">{relTime(d.created_at)}</td>
              <td className="px-3 py-2 text-right">
                <Link
                  href={`/admin/flashcards/review/${d.topic_id}`}
                  className="rounded bg-[#800000]/80 hover:bg-[#9a0a1f] text-white px-3 py-1 text-xs"
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
  if (draft.cards_needing_enhancement === 0) return <span className="text-green-400">✓ Complete ({ready}/{draft.total_cards})</span>
  const pct = Math.round((ready / draft.total_cards) * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-[#800000]" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-white/60 text-xs">{ready}/{draft.total_cards}</span>
    </div>
  )
}

function SourceBadge({ source }: { source: Draft['source_type'] }) {
  const map: Record<Draft['source_type'], string> = {
    csv: 'bg-blue-500/20 text-blue-300',
    pdf: 'bg-amber-500/20 text-amber-300',
    manual: 'bg-white/10 text-white/60',
    ai: 'bg-purple-500/20 text-purple-300',
  }
  return <span className={`px-2 py-0.5 rounded text-xs ${map[source]}`}>{source.toUpperCase()}</span>
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
