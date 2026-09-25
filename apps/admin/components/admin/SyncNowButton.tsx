'use client'

import { useTransition } from 'react'
import { triggerSync } from '@/app/admin/actions'
import { notifySuccess, notifyError } from '@/lib/toast'

export function SyncNowButton() {
  const [isPending, startTransition] = useTransition()

  function handleSync() {
    startTransition(async () => {
      try {
        const result = await triggerSync()
        if (result.error) {
          notifyError(result.error)
          return
        }
        notifySuccess(`Synced ${result.synced} · Skipped ${result.skipped} · Closed ${result.closed}`)
      } catch {
        notifyError('Sync failed — network error.')
      }
    })
  }

  return (
    <button
      onClick={handleSync}
      disabled={isPending}
      className="rounded-[980px] px-4 py-1.5 text-[13px] font-medium bg-maroon text-white hover:bg-maroon-light transition-colors disabled:opacity-60 shadow-sm"
    >
      {isPending ? '⏳ Syncing…' : '🔄 Sync Now'}
    </button>
  )
}
