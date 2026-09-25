'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { notifySuccess, notifyError } from '@/lib/toast'
import { Card } from '@/components/ui/Card'
import { Field, controlClass } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'

interface Props {
  currentUrl: string
}

// Next.js DOM component — react-doctor rn-no-raw-text alerts are false positives
// here (they apply to React Native, not the web admin).
export function PostHogDashboardForm({ currentUrl }: Props) {
  const router = useRouter()
  const [url, setUrl] = useState(currentUrl)
  const [saving, setSaving] = useState(false)
  // Client-side validation shows on the field; a server failure shows as a banner.
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving) return
    const trimmed = url.trim()
    if (trimmed !== '' && !trimmed.startsWith('https://')) {
      setFieldError('The URL must start with https://')
      return
    }

    setSaving(true)
    setFieldError(null)
    setServerError(null)
    setSaved(null)
    try {
      const res = await fetch('/api/analytics/dashboard-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })
      // An error page (e.g. a 502 from the host) may not be JSON; the status decides.
      const json = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; error?: string }
      if (!res.ok || !json.ok) {
        const message = json.error ?? 'Failed to save. Please try again.'
        setServerError(message)
        notifyError(message)
      } else {
        const message = trimmed === '' ? 'Dashboard link cleared.' : 'Dashboard link saved.'
        setSaved(message)
        notifySuccess(message)
        router.refresh()
      }
    } catch {
      setServerError('Network error. Check your connection and try again.')
      notifyError('Network error. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Dashboard link" description="Stored for the whole team — no redeploy needed. Leave empty and save to remove it.">
      <form noValidate onSubmit={handleSubmit} className="space-y-3">
        {serverError && <ErrorBanner title="Couldn’t save the dashboard link" message={serverError} />}
        <Field
          label="Dashboard embed link"
          id="posthog-url-input"
          hint="In PostHog, open a dashboard → Share → enable sharing → copy the embed URL."
          error={fieldError}
        >
          {p => (
            <input
              {...p}
              type="url"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setFieldError(null); setSaved(null) }}
              disabled={saving}
              placeholder="https://us.posthog.com/shared/XXXXXXXXXXXXXXXXXXXXXX"
              className={controlClass}
            />
          )}
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" size="sm" loading={saving}>
            {saving ? 'Saving…' : 'Save link'}
          </Button>
          <p aria-live="polite" aria-atomic="true" className="text-ui font-medium text-success-strong">
            {saved ?? ''}
          </p>
        </div>
      </form>
    </Card>
  )
}
