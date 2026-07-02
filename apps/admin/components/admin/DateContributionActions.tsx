'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  id: string
}

export function DateContributionActions({ id }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<null | 'approve' | 'reject'>(null)
  const [error, setError] = useState<string | null>(null)

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
        setError(json.error ?? 'Action failed. Please try again.')
        return
      }

      router.refresh()
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 min-w-[160px]">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => run('approve')}
          disabled={loading !== null}
          aria-label="Approve this date correction and apply it to the listing"
          className="rounded-[980px] px-3 py-1 text-[12px] font-semibold transition-colors whitespace-nowrap disabled:opacity-60 bg-[#800000] text-white hover:bg-[#a00000]"
        >
          {loading === 'approve' ? 'Approving…' : 'Approve'}
        </button>
        <button
          type="button"
          onClick={() => run('reject')}
          disabled={loading !== null}
          aria-label="Reject this date correction"
          className="rounded-[980px] px-3 py-1 text-[12px] font-semibold transition-colors whitespace-nowrap disabled:opacity-60 border border-[#800000] text-[#800000] bg-white hover:bg-[#fff8f8]"
        >
          {loading === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
      </div>
      {error && (
        <p className="text-[11px] text-red-600 leading-tight max-w-[220px]" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
