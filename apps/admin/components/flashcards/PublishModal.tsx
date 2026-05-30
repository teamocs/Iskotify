'use client'

import { useEffect, useState } from 'react'

interface Listing {
  slug: string
  title: string
  type?: string
}

interface Props {
  open: boolean
  title: string
  description: string
  topicIds: string[]                          // topics to publish (1+ for single, N for bulk)
  onClose: () => void
  onPublished: (publishedTopicIds: string[]) => void
  primaryLabel?: string                       // e.g. "Publish 3 topics"
}

export function PublishModal({
  open, title, description, topicIds, onClose, onPublished, primaryLabel,
}: Props) {
  const [listings, setListings] = useState<Listing[]>([])
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set())
  const [publishing, setPublishing] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null); setPublishing(false); setProgress(null); setSelectedSlugs(new Set())
    fetch('/api/admin/listings')
      .then(r => r.json())
      .then(body => {
        setListings(Array.isArray(body) ? body : (body.listings ?? []))
      })
      .catch(e => setError(e?.message ?? 'Failed to load listings'))
  }, [open])

  function toggleSlug(slug: string) {
    setSelectedSlugs(prev => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug); else next.add(slug)
      return next
    })
  }

  async function handlePublish() {
    if (selectedSlugs.size === 0 || topicIds.length === 0) return
    setPublishing(true); setError(null); setProgress({ done: 0, total: topicIds.length })

    const slugs = Array.from(selectedSlugs)
    const published: string[] = []
    const failed: Array<{ topicId: string; message: string }> = []

    for (let i = 0; i < topicIds.length; i++) {
      const topicId = topicIds[i]!
      try {
        const res = await fetch(`/api/flashcards/publish/${topicId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listing_slugs: slugs }),
        })
        if (res.ok) {
          published.push(topicId)
        } else {
          const body = await res.json().catch(() => ({}))
          failed.push({ topicId, message: body?.error ?? `HTTP ${res.status}` })
        }
      } catch (e: any) {
        failed.push({ topicId, message: e?.message ?? 'Network error' })
      }
      setProgress({ done: i + 1, total: topicIds.length })
    }

    setPublishing(false)
    if (failed.length > 0) {
      setError(
        `Published ${published.length}/${topicIds.length}. ${failed.length} failed: ` +
        failed.map(f => f.message).join('; ')
      )
    }
    if (published.length > 0) onPublished(published)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-black/[0.08] w-full max-w-2xl mt-12 mb-12"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-black/[0.06]">
          <h3 className="text-[#1d1d1f] font-heading font-bold text-xl tracking-tight">{title}</h3>
          <p className="text-[#6e6e73] text-sm mt-1">{description}</p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <div className="text-[#6e6e73] text-xs font-semibold uppercase tracking-wider mb-2">
              Tag to exams/scholarships
            </div>
            {listings.length === 0 ? (
              <div className="text-[#6e6e73] text-sm">Loading listings…</div>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
                {listings.map(l => {
                  const on = selectedSlugs.has(l.slug)
                  return (
                    <button
                      key={l.slug}
                      onClick={() => toggleSlug(l.slug)}
                      disabled={publishing}
                      className={`px-3 py-1.5 rounded-[980px] text-xs font-medium border transition-colors
                        ${on
                          ? 'bg-[#800000] text-white border-[#800000] shadow-sm'
                          : 'bg-white text-[#1d1d1f] border-black/[0.12] hover:border-[#800000]/60 hover:text-[#800000]'}
                        ${publishing ? 'opacity-50 cursor-not-allowed' : ''}
                      `}
                    >
                      {l.title}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {progress && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-[#6e6e73]">
                <span>Publishing…</span>
                <span className="tabular-nums">{progress.done}/{progress.total}</span>
              </div>
              <div className="w-full h-1.5 bg-black/[0.08] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#800000] transition-all"
                  style={{ width: `${(progress.done / progress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-black/[0.06] flex items-center justify-end gap-2 bg-[#fafafb] rounded-b-2xl">
          <button
            onClick={onClose}
            disabled={publishing}
            className="px-4 py-2 rounded-[980px] text-sm font-medium text-[#1d1d1f] hover:bg-black/[0.05] transition-colors disabled:opacity-50"
          >
            {progress?.done === progress?.total && progress ? 'Close' : 'Cancel'}
          </button>
          <button
            onClick={handlePublish}
            disabled={selectedSlugs.size === 0 || publishing || topicIds.length === 0}
            className={`px-5 py-2 rounded-[980px] text-sm font-semibold transition-colors shadow-sm
              ${selectedSlugs.size > 0 && !publishing && topicIds.length > 0
                ? 'bg-green-700 text-white hover:bg-green-800'
                : 'bg-[#f5f5f7] text-[#6e6e73] cursor-not-allowed'}
            `}
          >
            {publishing
              ? `Publishing ${progress?.done ?? 0}/${progress?.total ?? topicIds.length}…`
              : (primaryLabel ?? `Publish ${topicIds.length} topic${topicIds.length === 1 ? '' : 's'}`)}
          </button>
        </div>
      </div>
    </div>
  )
}
