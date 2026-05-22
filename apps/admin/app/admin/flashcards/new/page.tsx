'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ExamTagSelector } from '@/components/flashcards/ExamTagSelector'
import { Topbar } from '@/components/admin/Topbar'

interface Listing {
  slug: string
  title: string
}

interface CardRow {
  question: string
  answer: string
  explanation: string
}

const BLANK_CARD: CardRow = { question: '', answer: '', explanation: '' }

export default function NewFlashcardsPage() {
  const router = useRouter()

  const [subject, setSubject] = useState('')
  const [topic, setTopic] = useState('')
  const [listings, setListings] = useState<Listing[]>([])
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([])
  const [cards, setCards] = useState<CardRow[]>([{ ...BLANK_CARD }])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/listings')
      .then((res) => res.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setListings(
            (data as Array<{ slug: string; title: string }>).map((l) => ({
              slug: l.slug,
              title: l.title,
            }))
          )
        }
      })
      .catch((err) => console.error('[new] listings fetch error:', err))
  }, [])

  function updateCard(index: number, field: keyof CardRow, value: string) {
    setCards((prev) =>
      prev.map((c, i) =>
        i === index ? { ...c, [field]: value } : c
      )
    )
  }

  function addCard() {
    setCards((prev) => [...prev, { ...BLANK_CARD }])
  }

  function removeCard(index: number) {
    setCards((prev) => prev.filter((_, i) => i !== index))
  }

  const isValid =
    subject.trim().length > 0 &&
    topic.trim().length > 0 &&
    selectedSlugs.length > 0 &&
    cards.every((c) => c.question.trim().length > 0 && c.answer.trim().length > 0) &&
    !isSubmitting

  async function handleSubmit() {
    if (!isValid) return
    setIsSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/flashcards/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_name: subject.trim(),
          topic_name: topic.trim(),
          listing_slugs: selectedSlugs,
          cards: cards.map((c) => ({
            question: c.question,
            answer: c.answer,
            explanation: c.explanation,
          })),
        }),
      })
      if (res.ok) {
        router.push('/admin/flashcards')
      } else {
        const body = await res.json() as { error?: string }
        setError(body.error ?? 'Failed to save flashcards')
        setIsSubmitting(false)
      }
    } catch {
      setError('Failed to save — check your connection')
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Topbar title="Add Flashcards Manually" />
      <div className="flex-1 overflow-y-auto p-6 space-y-5 max-w-3xl">
        {/* Back link */}
        <Link
          href="/admin/flashcards"
          className="inline-block text-xs text-[#6e6e73] hover:text-[#1d1d1f] transition-colors"
        >
          ← Back to Subjects
        </Link>

        {/* Subject / Topic */}
        <div className="bg-white border border-[#e5e7eb] rounded-2xl p-4">
          <p className="text-[11px] font-bold text-[#800000] uppercase tracking-wider mb-3">
            Subject &amp; Topic
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">
                SUBJECT
              </label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Science"
                className="border border-[#d1d5db] rounded-lg px-3 py-2 text-sm w-full font-semibold text-[#1d1d1f] placeholder:font-normal placeholder:text-[#9ca3af] focus:outline-none focus:border-[#800000] transition-colors"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">
                TOPIC
              </label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Cell Biology"
                className="border border-[#d1d5db] rounded-lg px-3 py-2 text-sm w-full font-semibold text-[#1d1d1f] placeholder:font-normal placeholder:text-[#9ca3af] focus:outline-none focus:border-[#800000] transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Exam Tags */}
        <ExamTagSelector
          listings={listings}
          selected={selectedSlugs}
          onChange={setSelectedSlugs}
        />

        {/* Cards */}
        <div className="space-y-3">
          <p className="text-[11px] font-bold text-[#800000] uppercase tracking-wider">
            Flashcards
          </p>

          {cards.map((card, index) => (
            <div
              key={index}
              className="bg-white border border-[#e5e7eb] rounded-2xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-[#6e6e73]">
                  CARD {index + 1}
                </span>
                {cards.length > 1 && (
                  <button
                    onClick={() => removeCard(index)}
                    className="text-[11px] text-[#6e6e73] hover:text-[#800000] transition-colors font-medium"
                  >
                    Remove
                  </button>
                )}
              </div>

              <div>
                <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">
                  QUESTION
                </label>
                <textarea
                  value={card.question}
                  onChange={(e) => updateCard(index, 'question', e.target.value)}
                  rows={2}
                  placeholder="Enter the question"
                  className="border border-[#d1d5db] rounded-lg px-3 py-2 text-sm w-full text-[#1d1d1f] placeholder:text-[#9ca3af] focus:outline-none focus:border-[#800000] transition-colors resize-none"
                />
              </div>

              <div>
                <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">
                  ANSWER
                </label>
                <textarea
                  value={card.answer}
                  onChange={(e) => updateCard(index, 'answer', e.target.value)}
                  rows={2}
                  placeholder="Enter the answer"
                  className="border border-[#d1d5db] rounded-lg px-3 py-2 text-sm w-full text-[#1d1d1f] placeholder:text-[#9ca3af] focus:outline-none focus:border-[#800000] transition-colors resize-none"
                />
              </div>

              <div>
                <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">
                  EXPLANATION <span className="font-normal text-[#9ca3af]">(optional)</span>
                </label>
                <textarea
                  value={card.explanation}
                  onChange={(e) => updateCard(index, 'explanation', e.target.value)}
                  rows={2}
                  placeholder="Optional explanation or context"
                  className="border border-[#d1d5db] rounded-lg px-3 py-2 text-sm w-full text-[#1d1d1f] placeholder:text-[#9ca3af] focus:outline-none focus:border-[#800000] transition-colors resize-none"
                />
              </div>
            </div>
          ))}

          <button
            onClick={addCard}
            className="w-full py-2.5 border border-dashed border-[#d1d5db] rounded-xl text-xs font-semibold text-[#6e6e73] hover:border-[#800000] hover:text-[#800000] transition-colors"
          >
            + Add card
          </button>
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-[#800000] font-medium">{error}</p>
        )}

        {/* Submit */}
        <div className="pb-6">
          <button
            onClick={handleSubmit}
            disabled={!isValid}
            className="px-6 py-2.5 bg-[#800000] text-white text-sm font-semibold rounded-full hover:bg-[#6b0000] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Saving…' : 'Save to Knowledge Base'}
          </button>
        </div>
      </div>
    </>
  )
}
