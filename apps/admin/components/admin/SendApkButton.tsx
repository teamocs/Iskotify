'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { notifySuccess, notifyError } from '@/lib/toast'
import { Button } from '@/components/ui/Button'

interface Props {
  id: string
  status: string
  /** Names the registrant in the accessible label ("Send APK to ana@…"). */
  recipient?: string
}

const NETWORK_ERROR = 'Network error. Please check your connection and try again.'

export function SendApkButton({ id, status, recipient }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSent = status === 'sent'
  const label = isSent ? 'Resend APK' : 'Send APK'
  const ariaLabel = `${label} to ${recipient ?? 'this registrant'}`

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
        const message = json.error ?? 'Failed to send APK. Please try again.'
        setError(message)
        notifyError(message)
        return
      }

      notifySuccess(isSent ? 'APK link resent' : 'APK link sent')
      router.refresh()
    } catch {
      setError(NETWORK_ERROR)
      notifyError(NETWORK_ERROR)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant={isSent ? 'ghost' : 'secondary'}
        icon="mail"
        onClick={handleClick}
        loading={loading}
        aria-label={ariaLabel}
      >
        {loading ? 'Sending…' : label}
      </Button>
      {error && (
        <p className="max-w-[12rem] text-xs leading-tight text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
