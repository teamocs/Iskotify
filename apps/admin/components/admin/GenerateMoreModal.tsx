'use client'

import { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  topicId: string
  topicName: string
  subjectName: string
  existingQuestions: string[]
  listingSlugs: string[]
  onSuccess: () => void  // refresh callback for parent
}

export function GenerateMoreModal({
  open,
  onClose,
  topicId,
  topicName,
  subjectName,
  existingQuestions,
  listingSlugs,
  onSuccess,
}: Props) {
  const [count, setCount] = useState(5)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  async function handleGenerate() {
    if (isGenerating) return
    setIsGenerating(true)
    setError('')
    try {
      // 1. Call /generate to get N new cards w/ distractors already filled
      const genRes = await fetch('/api/flashcards/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_name: subjectName,
          topic_name: topicName,
          listing_slugs: listingSlugs,
          count,
          existing_questions: existingQuestions,
        }),
      })
      const genBody = await genRes.json() as {
        cards?: Array<{
          question: string; answer: string; explanation: string;
          aiOptions?: string[]; aiCorrectIndex?: number; aiExplanation?: string;
        }>;
        error?: string;
      }
      if (!genRes.ok || !genBody.cards) {
        setError(genBody.error ?? 'Generation failed')
        return
      }

      // 2. Insert them into this topic directly (server-side insert via /cards)
      const insertRes = await fetch('/api/flashcards/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic_id: topicId,
          listing_slugs: listingSlugs,
          cards: genBody.cards,
        }),
      })
      if (!insertRes.ok) {
        const body = await insertRes.json() as { error?: string }
        setError(body.error ?? 'Insert failed')
        return
      }

      onSuccess()
      onClose()
    } catch {
      setError('Network error')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-[#1d1d1f]">Generate more cards with AI</h2>
          <p className="text-xs text-[#6e6e73] mt-1">
            Topic: <strong>{topicName}</strong> · Subject: <strong>{subjectName}</strong>
          </p>
          <p className="text-xs text-[#6e6e73] mt-1">
            {existingQuestions.length} existing cards — Gemini will avoid duplicates.
          </p>
        </div>

        <div>
          <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">HOW MANY?</label>
          <div className="flex gap-2">
            {[5, 10, 15, 20].map(n => {
              const active = count === n
              return (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  disabled={isGenerating}
                  className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                    active
                      ? 'bg-[#800000] text-white border-[#800000]'
                      : 'bg-white text-[#1d1d1f] border-[#d1d5db] hover:border-[#800000]'
                  } disabled:opacity-40`}
                >
                  {n}
                </button>
              )
            })}
          </div>
        </div>

        {error && <p className="text-xs text-[#800000] font-medium">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="flex-1 px-4 py-2 border border-[#d1d5db] rounded-full text-sm font-semibold text-[#6e6e73] hover:bg-[#f5f5f7] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex-1 px-4 py-2 bg-[#1d1d1f] text-white text-sm font-semibold rounded-full hover:bg-black disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <span className="inline-block w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Generating…
              </>
            ) : (
              `✨ Generate ${count}`
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
