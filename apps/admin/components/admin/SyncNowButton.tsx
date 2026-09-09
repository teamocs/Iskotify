'use client'

import { useState, useTransition } from 'react'
import { triggerSync } from '@/app/admin/actions'

export function SyncNowButton() {
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  function handleSync() {
    startTransition(async () => {
      const result = await triggerSync()
      if (result.error) {
        setToast({ msg: result.error, ok: false })
      } else {
        setToast({ msg: `Synced ${result.synced} · Skipped ${result.skipped} · Closed ${result.closed}`, ok: true })
      }
      setTimeout(() => setToast(null), 4000)
    })
  }

  return (
    <div className="relative">
      <button
        onClick={handleSync}
        disabled={isPending}
        className="rounded-[980px] px-4 py-1.5 text-[13px] font-medium bg-maroon text-white hover:bg-maroon-light transition-colors disabled:opacity-60 shadow-sm"
      >
        {isPending ? '⏳ Syncing…' : '🔄 Sync Now'}
      </button>
      {toast && (
        <div className={`absolute top-10 right-0 z-50 rounded-[12px] px-4 py-2.5 text-[12px] font-medium shadow-lg whitespace-nowrap ${
          toast.ok ? 'bg-success text-white' : 'bg-danger-strong text-white'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
