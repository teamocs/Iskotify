'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  currentUrl: string
}

// Next.js DOM component — react-doctor rn-no-raw-text alerts are false positives
// here (they apply to React Native, not the web admin).
export function PostHogDashboardForm({ currentUrl }: Props) {
  const router = useRouter()
  const [url, setUrl] = useState(currentUrl)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  async function handleSave() {
    const trimmed = url.trim()
    if (trimmed !== '' && !trimmed.startsWith('https://')) {
      setStatus({ type: 'error', message: 'The URL must start with https://' })
      return
    }

    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch('/api/analytics/dashboard-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (!json.ok) {
        setStatus({ type: 'error', message: json.error ?? 'Failed to save. Please try again.' })
      } else {
        setStatus({ type: 'success', message: trimmed === '' ? 'Dashboard link cleared.' : 'Dashboard link saved.' })
        router.refresh()
      }
    } catch {
      setStatus({ type: 'error', message: 'Network error. Check your connection and try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-[12px] border border-black/[0.07] bg-[#fafafa] px-4 py-4 space-y-3">
      <p className="text-[12px] font-semibold text-[#1d1d1f] uppercase tracking-wide">
        PostHog dashboard embed link
      </p>

      <div className="space-y-2">
        <label htmlFor="posthog-url-input" className="block text-[13px] text-[#6e6e73]">
          In PostHog, open a dashboard → Share → enable sharing → copy the embed URL and paste it here.
        </label>
        <input
          id="posthog-url-input"
          type="url"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setStatus(null) }}
          disabled={saving}
          placeholder="https://us.posthog.com/shared/XXXXXXXXXXXXXXXXXXXXXX"
          className={[
            'w-full rounded-[8px] border px-3 py-2 text-[13px] text-[#1d1d1f]',
            'placeholder-[#aeaeb2] outline-none transition-colors',
            'focus:border-[#800000] focus:ring-1 focus:ring-[#800000]/30',
            saving ? 'border-black/10 bg-white/60 cursor-not-allowed' : 'border-black/[0.12] bg-white',
          ].join(' ')}
        />
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="rounded-[980px] px-4 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60 bg-[#800000] text-white hover:bg-[#a00000]"
      >
        {saving ? 'Saving…' : 'Save link'}
      </button>

      <div aria-live="polite" aria-atomic="true">
        {status?.type === 'error' && (
          <p className="text-[12px] text-red-600 bg-red-50 rounded-[8px] px-3 py-2" role="alert">
            {status.message}
          </p>
        )}
        {status?.type === 'success' && (
          <p className="text-[12px] text-green-700 bg-green-50 rounded-[8px] px-3 py-2">
            {status.message}
          </p>
        )}
      </div>
    </div>
  )
}
