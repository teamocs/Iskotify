'use client'

import { useState } from 'react'
import type { Listing } from '@iskotify/utils'

interface Props {
  listings: Listing[]
  onFilter: (filtered: Listing[]) => void
}

const TYPE_FILTERS = ['All', 'Scholarships', 'Exams'] as const

export function FilterBar({ listings, onFilter }: Props) {
  const [activeType, setActiveType] = useState<string>('All')
  const [search, setSearch] = useState('')

  function apply(type: string, q: string) {
    let result = listings
    if (type === 'Scholarships') result = result.filter(l => l.type === 'scholarship')
    if (type === 'Exams') result = result.filter(l => l.type === 'exam')
    if (q.trim()) {
      const lower = q.toLowerCase()
      result = result.filter(l =>
        l.title.toLowerCase().includes(lower) || l.provider.toLowerCase().includes(lower)
      )
    }
    onFilter(result)
  }

  function setType(t: string) {
    setActiveType(t)
    apply(t, search)
  }

  function setQ(q: string) {
    setSearch(q)
    apply(activeType, q)
  }

  return (
    <div className="bg-white border-b border-black/[0.08] px-6 py-3 flex items-center gap-2 flex-wrap">
      {TYPE_FILTERS.map(f => (
        <button
          key={f}
          onClick={() => setType(f)}
          className={`rounded-[980px] px-4 py-1 text-xs font-medium transition-colors ${
            activeType === f
              ? 'bg-[#800000] text-white'
              : 'bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]'
          }`}
        >
          {f}
        </button>
      ))}
      <div className="flex-1" />
      <input
        type="search"
        placeholder="🔍 Search listings…"
        value={search}
        onChange={e => setQ(e.target.value)}
        className="bg-[#f3f4f6] rounded-lg px-3 py-1.5 text-xs text-[#6b7280] outline-none w-48"
      />
    </div>
  )
}
