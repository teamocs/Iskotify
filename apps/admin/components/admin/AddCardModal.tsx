'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  topicId: string
  topicStatus: 'published' | 'draft'
  onClose: () => void
}

export function AddCardModal({ topicId, topicStatus, onClose }: Props) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [explanation, setExplanation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim() || !answer.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/flashcards/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic_id: topicId,
          question: question.trim(),
          answer: answer.trim(),
          explanation: explanation.trim(),
          status: topicStatus,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Something went wrong')
        return
      }
      router.refresh()
      onClose()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  const textareaCls = 'w-full px-3 py-2 rounded-[10px] border border-black/[0.08] text-sm bg-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#800000]/20 focus:border-[#800000] text-[#1d1d1f] resize-none'
  const labelCls = 'block text-[10px] font-semibold text-[#aeaeb2] uppercase tracking-wider mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.08]">
          <h2 className="font-heading font-bold text-[17px] text-[#1d1d1f]">Add Card</h2>
          <button onClick={onClose} className="text-[#aeaeb2] hover:text-[#1d1d1f] text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={labelCls}>Question</label>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              rows={3}
              placeholder="e.g. What is the quadratic formula?"
              className={textareaCls}
              autoFocus
            />
          </div>
          <div>
            <label className={labelCls}>Answer</label>
            <textarea
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              rows={3}
              placeholder="e.g. x = (-b ± √(b²-4ac)) / 2a"
              className={textareaCls}
            />
          </div>
          <div>
            <label className={labelCls}>Explanation (optional)</label>
            <textarea
              value={explanation}
              onChange={e => setExplanation(e.target.value)}
              rows={2}
              placeholder="e.g. Derived from completing the square…"
              className={textareaCls}
            />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-[10px] px-3 py-2">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-[980px] text-sm font-medium border border-black/[0.08] text-[#1d1d1f] hover:bg-[#f5f5f7]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!question.trim() || !answer.trim() || saving}
              className="px-5 py-2 rounded-[980px] text-sm font-medium bg-[#800000] text-white hover:bg-[#a00000] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Add Card'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
