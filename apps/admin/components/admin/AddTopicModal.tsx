'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { notifySuccess, notifyError } from '@/lib/toast'
import { Dialog } from '@/components/ui/Dialog'
import { Field, controlClass } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'

interface Props {
  subjectId: string
  onClose: () => void
}

/** A topic needs a name; returns the message to show, or undefined when valid. */
export function validateTopicName(name: string): string | undefined {
  return name.trim() ? undefined : 'Enter a topic name.'
}

export function AddTopicModal({ subjectId, onClose }: Props) {
  const [name, setName] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const [nameError, setNameError] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit() {
    if (saving) return
    const invalid = validateTopicName(name)
    setNameError(invalid)
    if (invalid) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/flashcards/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_id: subjectId, name: name.trim(), status: 'published' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const message = body.error ?? 'Something went wrong'
        setError(message)
        notifyError(message)
        return
      }
      notifySuccess('Topic added')
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
      size="sm"
      onClose={() => { if (!saving) onClose() }}
      title="Add topic"
      initialFocusRef={nameRef}
      onSubmit={handleSubmit}
      dirty={name !== ''}
      footer={close => (
        <>
          <Button onClick={close} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving}>{saving ? 'Saving…' : 'Add topic'}</Button>
        </>
      )}
    >
      <div className="space-y-3">
        {error && <ErrorBanner title="Couldn’t add the topic" message={error} />}
        <Field label="Topic name" required error={nameError}>
          {p => (
            <input {...p} ref={nameRef} type="text" value={name} placeholder="e.g. Algebra basics"
              onChange={e => setName(e.target.value)} className={controlClass} />
          )}
        </Field>
      </div>
    </Dialog>
  )
}
