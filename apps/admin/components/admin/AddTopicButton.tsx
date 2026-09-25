'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { AddTopicModal } from './AddTopicModal'

interface Props {
  subjectId: string
}

export function AddTopicButton({ subjectId }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="primary" size="sm" icon="plus" onClick={() => setOpen(true)}>
        Add topic
      </Button>
      {open && <AddTopicModal subjectId={subjectId} onClose={() => setOpen(false)} />}
    </>
  )
}
