'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DEFAULT_UPDATE_EMAIL_TEMPLATE } from '@/lib/updateRollout'

interface Props {
  initialTemplate: string
}

// NOTE: This is a Next.js DOM component — react-doctor rn-no-raw-text alerts
// are false positives here (they apply to React Native, not the web admin).

export function UpdateEmailTemplateForm({ initialTemplate }: Props) {
  const router = useRouter()
  const [template, setTemplate] = useState(initialTemplate)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  async function handleSave() {
    setSaving(true)
    setStatus(null)

    try {
      const res = await fetch('/api/admin/update-email-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string }

      if (!json.ok) {
        setStatus({ type: 'error', message: json.error ?? 'Failed to save. Please try again.' })
      } else {
        setStatus({ type: 'success', message: 'Email template saved successfully.' })
        router.refresh()
      }
    } catch {
      setStatus({ type: 'error', message: 'Network error. Check your connection and try again.' })
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setTemplate(DEFAULT_UPDATE_EMAIL_TEMPLATE)
    setStatus(null)
  }

  return (
    <div className="rounded-[12px] border border-black/[0.07] bg-surface-3 px-4 py-4 space-y-3">
      <p className="text-[12px] font-semibold text-ink uppercase tracking-wide">
        Update email template
      </p>

      <div className="space-y-2">
        <label
          htmlFor="update-email-template-input"
          className="block text-[13px] text-ink-muted"
        >
          Edit the email body sent to existing users about the update. Use{' '}
          <code className="text-[12px] font-mono text-maroon">{'{{name}}'}</code> for the
          recipient&rsquo;s name and{' '}
          <code className="text-[12px] font-mono text-maroon">{'{{apk_url}}'}</code> for the
          update download link — they are filled in automatically when the email is sent.
        </label>
        <textarea
          id="update-email-template-input"
          aria-label="Update email template"
          value={template}
          onChange={(e) => {
            setTemplate(e.target.value)
            setStatus(null)
          }}
          disabled={saving}
          rows={14}
          className={[
            'w-full rounded-[8px] border px-3 py-2 text-[12px] font-mono leading-relaxed text-ink',
            'placeholder-ink-subtle outline-none transition-colors resize-y',
            'focus:border-maroon focus:ring-1 focus:ring-maroon/30',
            saving ? 'border-black/10 bg-white/60 cursor-not-allowed' : 'border-black/[0.12] bg-white',
          ].join(' ')}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={[
            'rounded-[980px] px-4 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60',
            'bg-maroon text-white hover:bg-maroon-light',
          ].join(' ')}
        >
          {saving ? 'Saving…' : 'Save template'}
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={saving}
          className={[
            'rounded-[980px] px-4 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60',
            'border border-black/[0.12] bg-white text-ink-muted hover:bg-black/[0.03]',
          ].join(' ')}
        >
          Reset to default
        </button>
      </div>

      {/* Accessible live region for status messages */}
      <div aria-live="polite" aria-atomic="true">
        {status?.type === 'error' && (
          <p className="text-[12px] text-danger bg-danger-soft rounded-[8px] px-3 py-2" role="alert">
            {status.message}
          </p>
        )}
        {status?.type === 'success' && (
          <p className="text-[12px] text-success bg-success-soft rounded-[8px] px-3 py-2">
            {status.message}
          </p>
        )}
      </div>
    </div>
  )
}
