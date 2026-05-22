'use client'

import { useState } from 'react'

export interface Card {
  id: string
  question: string
  answer: string
  explanation: string
}

interface Props {
  cards: Card[]
  onUpdate: (id: string, updates: Partial<Card>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAdd: () => void
}

export function CardReviewTable({ cards, onUpdate, onDelete, onAdd }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<Card>>({})

  function startEdit(card: Card) {
    setEditingId(card.id)
    setDraft({ question: card.question, answer: card.answer, explanation: card.explanation })
  }

  async function saveEdit(id: string) {
    await onUpdate(id, draft)
    setEditingId(null)
    setDraft({})
  }

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[#f3f4f6] flex items-center justify-between">
        <span className="font-bold text-xs text-[#1d1d1f]">Extracted Cards</span>
        <button
          onClick={onAdd}
          className="border border-[#d1d5db] rounded-lg px-3 py-1 text-xs text-[#6e6e73] hover:bg-[#f5f5f7] transition-colors"
        >
          + Add manually
        </button>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-[#f9fafb] border-b border-[#f3f4f6]">
            <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wide text-[#6e6e73] font-semibold w-[40%]">Question</th>
            <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wide text-[#6e6e73] font-semibold w-[40%]">Answer</th>
            <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wide text-[#6e6e73] font-semibold w-[20%]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((card) =>
            editingId === card.id ? (
              <tr key={card.id} className="border-b border-[#f3f4f6] bg-[#fffbeb]">
                <td className="px-4 py-2">
                  <textarea
                    value={draft.question ?? ''}
                    onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                    className="w-full border border-[#d1d5db] rounded-md p-1.5 text-xs resize-none"
                    rows={3}
                  />
                </td>
                <td className="px-4 py-2">
                  <textarea
                    value={draft.answer ?? ''}
                    onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
                    className="w-full border border-[#d1d5db] rounded-md p-1.5 text-xs resize-none"
                    rows={3}
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => saveEdit(card.id)}
                      className="bg-[#800000] text-white rounded-md px-2 py-1 text-[11px] font-semibold"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="border border-[#d1d5db] rounded-md px-2 py-1 text-[11px]"
                    >
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={card.id} className="border-b border-[#f3f4f6] last:border-0">
                <td className="px-4 py-2.5 text-[#1d1d1f]">{card.question}</td>
                <td className="px-4 py-2.5 text-[#374151]">{card.answer}</td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={() => startEdit(card)}
                      className="bg-[#f5f5f7] border-0 rounded-md px-2 py-1 text-[11px]"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(card.id)}
                      className="bg-[#fff0f0] border-0 rounded-md px-2 py-1 text-[11px] text-[#800000]"
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
  )
}
