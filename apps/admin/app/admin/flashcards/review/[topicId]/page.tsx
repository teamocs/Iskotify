'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Topbar } from '@/components/admin/Topbar'
import { PublishModal } from '@/components/flashcards/PublishModal'

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
  ai_enhanced_at: string | null
}

interface Topic {
  id: string
  name: string
  status: string
  subject_id: string | null
  subject_name: string
}

export default function ReviewPage() {
  const params = useParams<{ topicId: string }>()
  const router = useRouter()
  const topicId = params.topicId

  const [topic, setTopic] = useState<Topic | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [publishModalOpen, setPublishModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let aborted = false
    async function load() {
      setLoading(true); setError(null)
      try {
        const [topicRes, cardsRes] = await Promise.all([
          fetch(`/api/flashcards/topics/${topicId}`),
          fetch(`/api/flashcards/cards?topic_id=${topicId}`),
        ])
        if (!topicRes.ok) throw new Error(`Topic load failed (${topicRes.status})`)
        if (!cardsRes.ok) throw new Error(`Cards load failed (${cardsRes.status})`)
        const topicBody: Topic = await topicRes.json()
        const cardsBody: Card[] = await cardsRes.json()
        if (aborted) return
        setTopic(topicBody)
        setCards(cardsBody)
      } catch (e: any) {
        if (!aborted) setError(e?.message ?? 'Failed to load')
      } finally {
        if (!aborted) setLoading(false)
      }
    }
    load()
    return () => { aborted = true }
  }, [topicId])

  function handlePublished() {
    setPublishModalOpen(false)
    router.push('/admin/flashcards/drafts')
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
              {loading ? 'Loading…' : (topic?.name ?? 'Topic not found')}
            </h2>
            <p className="text-[#6e6e73] text-sm mt-1">
              {cards.length} card{cards.length === 1 ? '' : 's'}
              {!loading && cards.length > 0 ? ' · review below, then publish to ship to mobile.' : ''}
            </p>
          </div>

          <section className="space-y-3">
            <h3 className="text-[#1d1d1f] text-[13px] font-semibold uppercase tracking-wider font-heading">
              Cards
            </h3>
            {loading ? (
              <div className="rounded-2xl border border-black/[0.08] bg-white px-6 py-12 text-center text-[#6e6e73] text-sm shadow-sm">
                Loading cards…
              </div>
            ) : cards.length === 0 ? (
              <div className="rounded-2xl border border-black/[0.08] bg-white px-6 py-12 text-center text-[#6e6e73] text-sm shadow-sm">
                No cards in this topic.
              </div>
            ) : (
              <div className="space-y-3">
                {cards.map((c, i) => {
                  const hasAi = Array.isArray(c.ai_options) && c.ai_options.length >= 4
                  const opts = hasAi ? c.ai_options! : (c.options ?? [])
                  const correct = hasAi ? c.ai_correct_index : c.correct_answer_index
                  return (
                    <div key={c.id} className="rounded-2xl border border-black/[0.08] bg-white p-5 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[#6e6e73] text-xs font-medium">Card {i + 1}</div>
                        {hasAi && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800">
                            AI-ENHANCED
                          </span>
                        )}
                      </div>
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
                      {(hasAi ? c.ai_explanation : c.explanation) && (
                        <div className="text-[#6e6e73] text-xs mt-3 leading-relaxed border-t border-black/[0.06] pt-2">
                          <span className="font-medium">Explanation:</span> {hasAi ? c.ai_explanation : c.explanation}
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
              onClick={() => setPublishModalOpen(true)}
              disabled={loading || cards.length === 0}
              className={`
                inline-flex items-center rounded-[980px] px-5 py-2 text-sm font-semibold transition-colors shadow-sm
                ${!loading && cards.length > 0
                  ? 'bg-green-700 text-white hover:bg-green-800'
                  : 'bg-[#f5f5f7] text-[#6e6e73] cursor-not-allowed'}
              `}
            >
              Publish {cards.length} card{cards.length === 1 ? '' : 's'}…
            </button>
          </div>
        </div>
      </div>

      <PublishModal
        open={publishModalOpen}
        title={`Publish "${topic?.name ?? 'topic'}"`}
        description={`Pick at least one exam or scholarship tag. All ${cards.length} cards in this topic will be tagged and marked published.`}
        topicIds={topic ? [topic.id] : []}
        onClose={() => setPublishModalOpen(false)}
        onPublished={handlePublished}
        primaryLabel={`Publish ${cards.length} cards`}
      />
    </div>
  )
}
