'use client'

import { useState } from 'react'
import { AddTopicModal } from './AddTopicModal'

interface Props {
  subjectId: string
}

export function AddTopicButton({ subjectId }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-xs font-semibold bg-[#800000] text-white rounded-lg hover:bg-[#6b0000] transition-colors"
      >
        + Add Topic
      </button>
      {open && <AddTopicModal subjectId={subjectId} onClose={() => setOpen(false)} />}
    </>
  )
}
