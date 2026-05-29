'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'

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
interface Listing { slug: string; title: string; type: string }

export default function ReviewPage() {
  const params = useParams() as { topicId: string }
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
        // /api/admin/listings returns a bare array
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

  if (error) {
    return <div className="p-6 text-red-300">{error}</div>
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white">{topic?.subject_name ?? '—'} · {topic?.name ?? '—'}</h1>
        <p className="text-white/50 text-sm mt-1">{cards.length} cards · pick exam/scholarship tags, then publish.</p>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-2">Tag to exams/scholarships</h2>
        <div className="flex flex-wrap gap-2">
          {listings.map(l => {
            const on = selectedSlugs.has(l.slug)
            return (
              <button
                key={l.slug}
                onClick={() => toggleSlug(l.slug)}
                className={`px-3 py-1.5 rounded-full text-xs border transition
                  ${on ? 'bg-[#800000] text-white border-[#800000]' : 'bg-white/5 text-white/70 border-white/15 hover:border-white/30'}
                `}
              >
                {l.title}
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-2">Cards</h2>
        <div className="space-y-3">
          {cards.map((c, i) => {
            const opts = (c.ai_options && c.ai_options.length >= 4) ? c.ai_options : (c.options ?? [])
            const correct = (c.ai_correct_index ?? c.correct_answer_index)
            return (
              <div key={c.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="text-white/40 text-xs mb-1">Card {i + 1}</div>
                <div className="text-white font-medium mb-2">{c.question}</div>
                <div className="text-white/70 text-sm mb-2">Answer: <span className="text-green-400">{c.answer}</span></div>
                {opts.length > 0 && (
                  <ul className="text-sm space-y-0.5 mt-2">
                    {opts.map((o, j) => (
                      <li key={j} className={j === correct ? 'text-green-400' : 'text-white/50'}>
                        {String.fromCharCode(65 + j)}. {o}
                      </li>
                    ))}
                  </ul>
                )}
                {opts.length === 0 && (
                  <div className="text-amber-400 text-xs">No distractors yet — Gemini will fill in shortly.</div>
                )}
                {c.explanation && <div className="text-white/50 text-xs mt-2">📝 {c.explanation}</div>}
              </div>
            )
          })}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={handlePublish}
          disabled={selectedSlugs.size === 0 || publishing}
          className={`
            rounded-lg px-5 py-2.5 text-sm font-semibold transition
            ${selectedSlugs.size > 0 && !publishing
              ? 'bg-green-700 text-white hover:bg-green-600'
              : 'bg-white/10 text-white/30 cursor-not-allowed'}
          `}
        >
          {publishing ? 'Publishing…' : `Publish ${cards.length} cards`}
        </button>
        <span className="text-white/40 text-xs">Tag at least one exam/scholarship to enable publish</span>
      </div>
    </div>
  )
}
