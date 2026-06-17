'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  id: string
  status: string
}

export function SendApkButton({ id, status }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSent = status === 'sent'
  const label = isSent ? 'Resend APK' : 'Send APK'
  const ariaLabel = isSent
    ? 'Resend APK download link to this registrant'
    : 'Send APK download link to this registrant'

  async function handleClick() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/early-access/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })

      const json = (await res.json()) as { ok: boolean; error?: string }

      if (!json.ok) {
        setError(json.error ?? 'Failed to send APK. Please try again.')
        return
      }

      router.refresh()
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 min-w-[100px]">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        aria-label={ariaLabel}
        className={[
          'rounded-[980px] px-3 py-1 text-[12px] font-semibold transition-colors whitespace-nowrap disabled:opacity-60',
          isSent
            ? 'border border-[#800000] text-[#800000] bg-white hover:bg-[#fff8f8]'
            : 'bg-[#800000] text-white hover:bg-[#a00000]',
        ].join(' ')}
      >
        {loading ? 'Sending…' : label}
      </button>
      {error && (
        <p className="text-[11px] text-red-600 leading-tight max-w-[180px]" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
