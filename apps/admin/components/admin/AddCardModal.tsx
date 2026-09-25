'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { notifySuccess, notifyError } from '@/lib/toast'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { CardFields, validateCard, isCardDirty, type CardErrors, type CardValues } from './cardForm'

interface Props {
  topicId: string
  topicStatus: 'published' | 'draft'
  onClose: () => void
}

const EMPTY: CardValues = { question: '', answer: '', explanation: '' }

export function AddCardModal({ topicId, topicStatus, onClose }: Props) {
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState<CardErrors>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit() {
    if (saving) return
    const found = validateCard(values)
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/flashcards/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic_id: topicId,
          question: values.question.trim(),
          answer: values.answer.trim(),
          explanation: values.explanation.trim(),
          status: topicStatus,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const message = body.error ?? 'Something went wrong'
        setError(message)
        notifyError(message)
        return
      }
      notifySuccess('Card added')
      router.refresh()
      onClose()
    } catch {
      setError('Network error')
      notifyError('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onClose={() => { if (!saving) onClose() }}
      title="Add card"
      onSubmit={handleSubmit}
      dirty={isCardDirty(values, EMPTY)}
      footer={close => (
        <>
          <Button onClick={close} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving}>{saving ? 'Saving…' : 'Add card'}</Button>
        </>
      )}
    >
      <div className="space-y-3">
        {error && <ErrorBanner title="Couldn’t add the card" message={error} />}
        <CardFields values={values} errors={errors} onChange={setValues} />
      </div>
    </Dialog>
  )
}
