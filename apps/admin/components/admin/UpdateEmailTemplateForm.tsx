'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { DEFAULT_UPDATE_EMAIL_TEMPLATE } from '@/lib/updateRollout'
import { notifySuccess, notifyError } from '@/lib/toast'
import { Field, controlClass } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'

interface Props {
  initialTemplate: string
}

const NETWORK_ERROR = 'Network error. Check your connection and try again.'

export function UpdateEmailTemplateForm({ initialTemplate }: Props) {
  const router = useRouter()
  const [template, setTemplate] = useState(initialTemplate)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setServerError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/admin/update-email-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string }

      if (!json.ok) {
        const message = json.error ?? 'Failed to save. Please try again.'
        setServerError(message)
        notifyError(message)
      } else {
        const message = 'Email template saved successfully.'
        setSuccess(message)
        notifySuccess(message)
        router.refresh()
      }
    } catch {
      setServerError(NETWORK_ERROR)
      notifyError(NETWORK_ERROR)
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setTemplate(DEFAULT_UPDATE_EMAIL_TEMPLATE)
    setServerError(null)
    setSuccess(null)
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-3">
      {serverError && <ErrorBanner title="Couldn’t save the template" message={serverError} />}
      <Field
        id="update-email-template-input"
        label="Update email template"
        hint={
          <>
            The email body sent to existing users about the update. Use{' '}
            <code className="font-mono text-ink">{'{{name}}'}</code> for the recipient&rsquo;s name and{' '}
            <code className="font-mono text-ink">{'{{apk_url}}'}</code> for the update download link; both are
            filled in when the email is sent.
          </>
        }
      >
        {p => (
          <textarea
            {...p}
            value={template}
            onChange={e => { setTemplate(e.target.value); setSuccess(null) }}
            disabled={saving}
            rows={14}
            className={`${controlClass} h-auto py-2 font-mono text-xs leading-relaxed resize-y`}
          />
        )}
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" loading={saving}>{saving ? 'Saving…' : 'Save template'}</Button>
        <Button size="sm" variant="ghost" onClick={handleReset} disabled={saving}>Reset to default</Button>
        <p aria-live="polite" aria-atomic="true" className="text-ui text-success">{success}</p>
      </div>
    </form>
  )
}
