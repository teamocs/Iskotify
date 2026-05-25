'use client'

import { useState } from 'react'
import { AddCardModal } from './AddCardModal'

interface Props {
  topicId: string
  topicStatus: 'published' | 'draft'
}

export function AddCardButton({ topicId, topicStatus }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-xs font-semibold bg-[#800000] text-white rounded-lg hover:bg-[#6b0000] transition-colors"
      >
        + Add Card
      </button>
      {open && <AddCardModal topicId={topicId} topicStatus={topicStatus} onClose={() => setOpen(false)} />}
    </>
  )
}
