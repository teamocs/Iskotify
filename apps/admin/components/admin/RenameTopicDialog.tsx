'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog } from '@/components/ui/Dialog'
import { Field, controlClass } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { renameTopic } from '@/lib/admin/topicsApi'
import { notifySuccess, notifyError } from '@/lib/toast'
import { validateTopicName } from './AddTopicModal'

/** Rename a topic. Saves, toasts and refreshes the page on success. */
export function RenameTopicDialog({ topicId, currentName, onClose }: {
  topicId: string
  currentName: string
  onClose: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(currentName)
  const nameRef = useRef<HTMLInputElement>(null)
  const [nameError, setNameError] = useState<string | undefined>()
  const [serverError, setServerError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (saving) return
    const invalid = validateTopicName(name)
    setNameError(invalid)
    if (invalid) return
    setSaving(true)
    setServerError('')
    try {
      const result = await renameTopic(topicId, name)
      if (!result.ok) {
        setServerError(result.error)
        notifyError(result.error)
        return
      }
      notifySuccess('Topic renamed')
      router.refresh()
      onClose()
    } catch {
      setServerError('Network error')
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
      title="Rename topic"
      initialFocusRef={nameRef}
      onSubmit={handleSubmit}
      dirty={name !== currentName}
      footer={close => (
        <>
          <Button onClick={close} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving}>{saving ? 'Saving…' : 'Save name'}</Button>
        </>
      )}
    >
      <div className="space-y-3">
        {serverError && <ErrorBanner title="Couldn’t rename the topic" message={serverError} />}
        <Field label="Topic name" required error={nameError}>
          {p => (
            <input {...p} ref={nameRef} type="text" value={name}
              onChange={e => setName(e.target.value)} className={controlClass} />
          )}
        </Field>
      </div>
    </Dialog>
  )
}
