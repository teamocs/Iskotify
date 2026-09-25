'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { notifySuccess, notifyError } from '@/lib/toast'
import { Button } from '@/components/ui/Button'

interface Props {
  id: string
  /** Names the listing in the buttons' accessible labels. */
  label?: string
}

const NETWORK_ERROR = 'Network error. Please check your connection and try again.'

export function DateContributionActions({ id, label }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<null | 'approve' | 'reject'>(null)
  const [error, setError] = useState<string | null>(null)
  const target = label ? `date correction for ${label}` : 'this date correction'

  async function run(action: 'approve' | 'reject') {
    setLoading(action)
    setError(null)

    try {
      const res = await fetch('/api/admin/date-contributions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })

      const json = (await res.json()) as { ok?: boolean; error?: string }

      if (!res.ok || !json.ok) {
        const message = json.error ?? 'Action failed. Please try again.'
        setError(message)
        notifyError(message)
        return
      }

      notifySuccess(action === 'approve' ? 'Date correction approved' : 'Date correction rejected')
      router.refresh()
    } catch {
      setError(NETWORK_ERROR)
      notifyError(NETWORK_ERROR)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          icon="check"
          onClick={() => run('approve')}
          disabled={loading !== null}
          loading={loading === 'approve'}
          aria-label={`Approve ${target}`}
          title="Approve and write the suggested date onto the listing"
        >
          {loading === 'approve' ? 'Approving…' : 'Approve'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon="x"
          onClick={() => run('reject')}
          disabled={loading !== null}
          loading={loading === 'reject'}
          aria-label={`Reject ${target}`}
        >
          {loading === 'reject' ? 'Rejecting…' : 'Reject'}
        </Button>
      </div>
      {error && (
        <p className="max-w-[14rem] text-xs leading-tight text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
