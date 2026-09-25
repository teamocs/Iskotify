'use client'

import { useTransition } from 'react'
import { triggerSync } from '@/app/admin/actions'
import { notifySuccess, notifyError } from '@/lib/toast'
import { Button } from '@/components/ui/Button'

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

  // Secondary: the page's primary (maroon) action belongs to the page itself.
  return (
    <Button size="sm" icon="refresh" loading={isPending} onClick={handleSync}>
      {isPending ? 'Syncing…' : 'Sync now'}
    </Button>
  )
}
