'use client'

import React, { useState, useEffect } from 'react'
import { AddCardModal } from './AddCardModal'

interface Card {
  id: string
  question: string
  answer: string
  explanation: string | null
}

interface Topic {
  id: string
  name: string
  status: 'published' | 'draft'
  cardCount: number
}

interface Props {
  subjectId: string
  topic: Topic
  defaultOpen: boolean
}

const textareaCls =
  'w-full px-3 py-2 rounded-[10px] border border-black/[0.08] text-sm bg-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#800000]/20 focus:border-[#800000] text-[#1d1d1f] resize-none'

export function TopicCardSection({ subjectId, topic, defaultOpen }: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [cards, setCards] = useState<Card[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [addingCard, setAddingCard] = useState(false)
  const [localCardCount, setLocalCardCount] = useState(topic.cardCount)
  const [editQ, setEditQ] = useState('')
  const [editA, setEditA] = useState('')
  const [editExp, setEditExp] = useState('')
  const [error, setError] = useState('')

  const abortRef = React.useRef<AbortController | null>(null)

  async function loadCards(pageNum: number, replace = false) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const res = await fetch(
        `/api/flashcards/subjects/${subjectId}/cards?topic_id=${topic.id}&page=${pageNum}&limit=10`,
        { signal: controller.signal }
      )
      if (!controller.signal.aborted) {
        if (res.ok) {
          const data = await res.json()
          setCards(prev => (replace ? data.cards : [...prev, ...data.cards]))
          setHasMore(data.hasMore)
          setPage(pageNum)
        } else {
          setError('Failed to load cards')
        }
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        setError('Failed to load cards')
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    if (isOpen && cards.length === 0) {
      loadCards(1)
    }
    return () => {
      abortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Intentionally runs only on isOpen change, not on every loadCards re-creation
  }, [isOpen])

  function startEdit(card: Card) {
    setError('')
    setEditingId(card.id)
    setEditQ(card.question)
    setEditA(card.answer)
    setEditExp(card.explanation ?? '')
    setDeletingId(null)
  }

  async function saveEdit() {
    if (!editingId) return
    setError('')
    setSaving(true)
    try {
      const res = await fetch(`/api/flashcards/cards/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: editQ.trim(),
          answer: editA.trim(),
          explanation: editExp.trim() || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Something went wrong')
        return
      }
      setCards(prev =>
        prev.map(c =>
          c.id === editingId
            ? { ...c, question: editQ.trim(), answer: editA.trim(), explanation: editExp.trim() || null }
            : c
        )
      )
      setEditingId(null)
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deletingId) return
    setError('')
    setSaving(true)
    try {
      const res = await fetch(`/api/flashcards/cards/${deletingId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Something went wrong')
        return
      }
      setCards(prev => prev.filter(c => c.id !== deletingId))
      setLocalCardCount(prev => Math.max(0, prev - 1))
      setDeletingId(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
      {/* Accordion header */}
      <div className="flex items-center justify-between px-5 py-4">
        <button
          className="flex items-center gap-3 flex-1 text-left hover:opacity-80 transition-opacity"
          onClick={() => setIsOpen(o => !o)}
        >
          <span
            className={`text-[#aeaeb2] transition-transform text-sm inline-block ${isOpen ? 'rotate-90' : ''}`}
          >
            ›
          </span>
          <span className="font-medium text-[#1d1d1f]">{topic.name}</span>
          <span className="text-xs text-[#6e6e73]">({localCardCount} cards)</span>
        </button>
        {isOpen && (
          <button
            onClick={() => setAddingCard(true)}
            className="text-xs font-medium text-[#800000] hover:text-[#a00000] px-3 py-1 rounded-[980px] border border-[#800000]/20 hover:bg-[#800000]/5 flex-shrink-0"
          >
            + Add Card
          </button>
        )}
      </div>

      {isOpen && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block border-t border-[#f3f4f6]">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#f9fafb] border-b border-[#f3f4f6]">
                  <th className="px-5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73] w-[35%]">
                    Question
                  </th>
                  <th className="px-5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73] w-[35%]">
                    Answer
                  </th>
                  <th className="px-5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73] w-[20%]">
                    Explanation
                  </th>
                  <th className="px-5 py-2 w-[10%]" />
                </tr>
              </thead>
              <tbody>
                {cards.map(card =>
                  editingId === card.id ? (
                    <tr key={card.id} className="border-b border-[#f3f4f6] bg-[#fafafa]">
                      <td className="px-5 py-3">
                        <textarea
                          value={editQ}
                          onChange={e => setEditQ(e.target.value)}
                          className={textareaCls}
                          rows={2}
                        />
                      </td>
                      <td className="px-5 py-3">
                        <textarea
                          value={editA}
                          onChange={e => setEditA(e.target.value)}
                          className={textareaCls}
                          rows={2}
                        />
                      </td>
                      <td className="px-5 py-3">
                        <textarea
                          value={editExp}
                          onChange={e => setEditExp(e.target.value)}
                          className={textareaCls}
                          rows={2}
                        />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-col gap-1">
                          {error && (
                            <p className="bg-red-50 rounded-[10px] px-3 py-2 text-sm text-red-600 mb-1">
                              {error}
                            </p>
                          )}
                          <button
                            onClick={saveEdit}
                            disabled={saving || !editQ.trim() || !editA.trim()}
                            className="text-xs font-medium text-[#800000] hover:text-[#a00000] disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setError('') }}
                            className="text-xs text-[#6e6e73] hover:text-[#1d1d1f]"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={card.id} className="border-b border-[#f3f4f6] last:border-0 hover:bg-[#f9fafb]">
                      <td className="px-5 py-3 text-[#1d1d1f]">{card.question}</td>
                      <td className="px-5 py-3 text-[#374151]">{card.answer}</td>
                      <td className="px-5 py-3 text-[#6e6e73]">{card.explanation}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => startEdit(card)}
                            className="text-xs text-[#6e6e73] hover:text-[#1d1d1f]"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => { setDeletingId(card.id); setEditingId(null); setError('') }}
                            className="text-xs text-[#6e6e73] hover:text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden border-t border-[#f3f4f6] divide-y divide-[#f3f4f6]">
            {cards.map(card => (
              <div key={card.id} className="p-4">
                {editingId === card.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editQ}
                      onChange={e => setEditQ(e.target.value)}
                      className={textareaCls}
                      rows={2}
                      placeholder="Question"
                    />
                    <textarea
                      value={editA}
                      onChange={e => setEditA(e.target.value)}
                      className={textareaCls}
                      rows={2}
                      placeholder="Answer"
                    />
                    <textarea
                      value={editExp}
                      onChange={e => setEditExp(e.target.value)}
                      className={textareaCls}
                      rows={2}
                      placeholder="Explanation (optional)"
                    />
                    {error && (
                      <p className="bg-red-50 rounded-[10px] px-3 py-2 text-sm text-red-600">
                        {error}
                      </p>
                    )}
                    <div className="flex gap-3">
                      <button
                        onClick={saveEdit}
                        disabled={saving || !editQ.trim() || !editA.trim()}
                        className="text-xs font-medium text-[#800000] disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setEditingId(null); setError('') }}
                        className="text-xs text-[#6e6e73]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="font-medium text-[#1d1d1f] text-sm">{card.question}</p>
                    <p className="text-sm text-[#374151] mt-1">{card.answer}</p>
                    {card.explanation && (
                      <p className="text-xs text-[#6e6e73] mt-1">{card.explanation}</p>
                    )}
                    <div className="flex gap-3 mt-2 justify-end">
                      <button
                        onClick={() => startEdit(card)}
                        className="text-xs text-[#6e6e73] hover:text-[#1d1d1f]"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => { setDeletingId(card.id); setEditingId(null); setError('') }}
                        className="text-xs text-[#6e6e73] hover:text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Delete confirm banner */}
          {deletingId && (
            <div className="px-5 py-3 bg-red-50 border-t border-red-100 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-red-700">Delete this card? This cannot be undone.</p>
                <div className="flex gap-3">
                  <button
                    onClick={confirmDelete}
                    disabled={saving}
                    className="text-xs font-semibold text-red-700 hover:text-red-900 disabled:opacity-50"
                  >
                    Yes, delete
                  </button>
                  <button
                    onClick={() => { setDeletingId(null); setError('') }}
                    className="text-xs text-[#6e6e73] hover:text-[#1d1d1f]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              {error && (
                <p className="bg-red-50 rounded-[10px] px-3 py-2 text-sm text-red-600 border border-red-200">
                  {error}
                </p>
              )}
            </div>
          )}

          {/* Loading / empty / load-more */}
          {loading && (
            <p className="px-5 py-4 text-sm text-[#6e6e73] border-t border-[#f3f4f6]">Loading…</p>
          )}
          {!loading && cards.length === 0 && (
            <p className="px-5 py-4 text-sm text-[#6e6e73] border-t border-[#f3f4f6]">
              No cards yet. Use &quot;+ Add Card&quot; to create the first one.
            </p>
          )}
          {!loading && hasMore && (
            <button
              onClick={() => loadCards(page + 1)}
              className="w-full px-5 py-3 text-sm text-[#800000] hover:bg-[#f9fafb] border-t border-[#f3f4f6] text-left transition-colors"
            >
              Load more…
            </button>
          )}
        </>
      )}

      {addingCard && (
        <AddCardModal
          topicId={topic.id}
          topicStatus={topic.status}
          onClose={() => {
            setAddingCard(false)
            setCards([])
            setPage(1)
            loadCards(1, true)
          }}
        />
      )}
    </div>
  )
}
