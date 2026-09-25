'use client'

import { useState, type FormEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { notifySuccess, notifyError } from '@/lib/toast'
import { Field, controlClass } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'

export interface HostedUrlFormProps {
  currentUrl: string
  inputId: string
  label: string
  hint: ReactNode
  placeholder: string
  endpoint: string
  savedMessage: string
  clearedMessage: string
}

const NETWORK_ERROR = 'Network error. Check your connection and try again.'

/** A single https:// download link saved to app_config through `endpoint`. Empty clears it. */
export function HostedUrlForm({ currentUrl, inputId, label, hint, placeholder, endpoint, savedMessage, clearedMessage }: HostedUrlFormProps) {
  const router = useRouter()
  const [url, setUrl] = useState(currentUrl)
  const [saving, setSaving] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = url.trim()
    setSuccess(null)
    setServerError(null)

    // Non-empty must start with https:// (empty clears the link).
    if (trimmed !== '' && !trimmed.startsWith('https://')) {
      setFieldError('The URL must start with https://')
      return
    }
    setFieldError(null)
    setSaving(true)

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string }

      if (!json.ok) {
        const message = json.error ?? 'Failed to save. Please try again.'
        setServerError(message)
        notifyError(message)
      } else {
        const message = trimmed === '' ? clearedMessage : savedMessage
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

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-3">
      {serverError && <ErrorBanner title="Couldn’t save the link" message={serverError} />}
      <Field id={inputId} label={label} hint={hint} error={fieldError}>
        {p => (
          <input
            {...p}
            type="url"
            inputMode="url"
            value={url}
            onChange={e => { setUrl(e.target.value); setFieldError(null); setSuccess(null) }}
            disabled={saving}
            placeholder={placeholder}
            className={controlClass}
          />
        )}
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" loading={saving}>{saving ? 'Saving…' : 'Save link'}</Button>
        <p aria-live="polite" aria-atomic="true" className="text-ui text-success">
          {success}
        </p>
      </div>
    </form>
  )
}
