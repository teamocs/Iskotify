'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Topbar } from '@/components/admin/Topbar'

interface Card {
  id: string
  question: string
  answer: string
  explanation: string | null
  options: string[] | null
  correct_answer_index: number | null
  ai_options: string[] | null
  ai_correct_index: number | null
  ai_explanation: string | null
}

interface Topic { id: string; name: string; subject_name: string }
interface Listing { slug: string; title: string; type?: string }

export default function ReviewPage() {
  const params = useParams<{ topicId: string }>()
  const router = useRouter()
  const topicId = params.topicId

  const [topic, setTopic] = useState<Topic | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set())
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [topicRes, cardsRes, listingsRes] = await Promise.all([
          fetch(`/api/flashcards/topics/${topicId}`),
          fetch(`/api/flashcards/cards?topic_id=${topicId}`),
          fetch('/api/admin/listings'),
        ])
        const topicBody = await topicRes.json()
        const cardsBody = await cardsRes.json()
        const listingsBody = await listingsRes.json()
        setTopic(topicBody.topic ?? null)
        setCards(cardsBody.cards ?? [])
        setListings(Array.isArray(listingsBody) ? listingsBody : (listingsBody.listings ?? []))
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load')
      }
    }
    load()
  }, [topicId])

  async function handlePublish() {
    if (selectedSlugs.size === 0) return
    setPublishing(true)
    const res = await fetch(`/api/flashcards/publish/${topicId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listing_slugs: Array.from(selectedSlugs) }),
    })
    setPublishing(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Publish failed')
      return
    }
    router.push('/admin/flashcards/drafts')
  }

  function toggleSlug(slug: string) {
    setSelectedSlugs(prev => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug); else next.add(slug)
      return next
    })
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar title="Review & Publish" />
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-5xl mx-auto space-y-6">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">
              {error}
            </div>
          )}

          <div>
            <div className="text-[#6e6e73] text-xs font-semibold uppercase tracking-wider mb-1">
              {topic?.subject_name ?? '—'}
            </div>
            <h2 className="text-[#1d1d1f] font-heading font-bold text-2xl tracking-tight">
              {topic?.name ?? 'Loading…'}
            </h2>
            <p className="text-[#6e6e73] text-sm mt-1">
              {cards.length} card{cards.length === 1 ? '' : 's'} · pick exam/scholarship tags below, then publish to ship to mobile.
            </p>
          </div>

          <section className="rounded-2xl border border-black/[0.08] bg-white p-5 shadow-sm">
            <h3 className="text-[#1d1d1f] text-[13px] font-semibold uppercase tracking-wider mb-3 font-heading">
              Tag to exams/scholarships
            </h3>
            {listings.length === 0 ? (
              <div className="text-[#6e6e73] text-sm">Loading listings…</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {listings.map(l => {
                  const on = selectedSlugs.has(l.slug)
                  return (
                    <button
                      key={l.slug}
                      onClick={() => toggleSlug(l.slug)}
                      className={`px-3 py-1.5 rounded-[980px] text-xs font-medium border transition-colors
                        ${on
                          ? 'bg-[#800000] text-white border-[#800000] shadow-sm'
                          : 'bg-white text-[#1d1d1f] border-black/[0.12] hover:border-[#800000]/60 hover:text-[#800000]'}
                      `}
                    >
                      {l.title}
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-[#1d1d1f] text-[13px] font-semibold uppercase tracking-wider font-heading">
              Cards ({cards.length})
            </h3>
            {cards.length === 0 ? (
              <div className="rounded-2xl border border-black/[0.08] bg-white px-6 py-12 text-center text-[#6e6e73] text-sm shadow-sm">
                Loading cards…
              </div>
            ) : (
              <div className="space-y-3">
                {cards.map((c, i) => {
                  const opts = (c.ai_options && c.ai_options.length >= 4) ? c.ai_options : (c.options ?? [])
                  const correct = (c.ai_correct_index ?? c.correct_answer_index)
                  return (
                    <div key={c.id} className="rounded-2xl border border-black/[0.08] bg-white p-5 shadow-sm">
                      <div className="text-[#6e6e73] text-xs font-medium mb-2">Card {i + 1}</div>
                      <div className="text-[#1d1d1f] font-medium mb-2 leading-snug">{c.question}</div>
                      <div className="text-[#1d1d1f] text-sm mb-3">
                        <span className="text-[#6e6e73]">Answer: </span>
                        <span className="text-green-700 font-medium">{c.answer}</span>
                      </div>
                      {opts.length > 0 ? (
                        <ul className="text-sm space-y-1 mt-2 pl-1">
                          {opts.map((o, j) => (
                            <li
                              key={j}
                              className={j === correct ? 'text-green-700 font-medium' : 'text-[#6e6e73]'}
                            >
                              <span className="inline-block w-5 font-medium">{String.fromCharCode(65 + j)}.</span>
                              {o}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
                          ⏳ No distractors yet — Gemini will fill in shortly
                        </div>
                      )}
                      {c.explanation && (
                        <div className="text-[#6e6e73] text-xs mt-3 leading-relaxed border-t border-black/[0.06] pt-2">
                          <span className="font-medium">Explanation:</span> {c.explanation}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handlePublish}
              disabled={selectedSlugs.size === 0 || publishing}
              className={`
                inline-flex items-center rounded-[980px] px-5 py-2 text-sm font-semibold transition-colors shadow-sm
                ${selectedSlugs.size > 0 && !publishing
                  ? 'bg-green-700 text-white hover:bg-green-800'
                  : 'bg-[#f5f5f7] text-[#6e6e73] cursor-not-allowed'}
              `}
            >
              {publishing ? 'Publishing…' : `Publish ${cards.length} card${cards.length === 1 ? '' : 's'}`}
            </button>
            <span className="text-[#6e6e73] text-xs">
              Tag at least one exam/scholarship to enable publish
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
