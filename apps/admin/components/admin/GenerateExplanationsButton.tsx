'use client'

import { useState, useTransition } from 'react'

interface Props {
  /** Which table to backfill. Renders its own button + label. */
  source: 'flashcards' | 'upcat_questions'
  label?: string
}

/**
 * Task E bulk admin action — "Generate explanations" for existing rows
 * missing option_explanations/strategy_tip (see 049_question_explanations.sql
 * + /api/questions/explanations-backfill). Cookie-auth same-origin fetch —
 * same pattern as GenerateMoreModal's calls to /api/flashcards/generate,
 * simpler than SyncNowButton's server-action + Bearer-secret round trip
 * because this route already gates on the admin's own session cookie.
 */
export function GenerateExplanationsButton({ source, label }: Props) {
  const [isPending, startTransition] = useTransition()
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  function handleClick() {
    startTransition(async () => {
      try {
        const res = await fetch('/api/questions/explanations-backfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source }),
        })
        const body = await res.json() as {
          succeeded?: number; failed?: number; remaining?: number; error?: string
        }
        if (!res.ok) {
          setToast({ msg: body.error ?? 'Generation failed', ok: false })
        } else {
          setToast({
            msg: `Generated ${body.succeeded ?? 0} · Failed ${body.failed ?? 0} · ${body.remaining ?? 0} remaining`,
            ok: true,
          })
        }
      } catch {
        setToast({ msg: 'Network error', ok: false })
      }
      setTimeout(() => setToast(null), 5000)
    })
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="rounded-[980px] px-4 py-1.5 text-[13px] font-medium bg-white text-[#800000] border border-[#800000]/30 hover:bg-[#800000]/5 transition-colors disabled:opacity-60"
      >
        {isPending ? '⏳ Generating…' : (label ?? '✨ Generate explanations')}
      </button>
      {toast && (
        <div className={`absolute top-10 right-0 z-50 rounded-[12px] px-4 py-2.5 text-[12px] font-medium shadow-lg whitespace-nowrap ${
          toast.ok ? 'bg-green-700 text-white' : 'bg-red-700 text-white'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
