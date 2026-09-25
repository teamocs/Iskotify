'use client'

import { useTransition } from 'react'
import { notifySuccess, notifyError } from '@/lib/toast'
import { Button } from '@/components/ui/Button'

interface Props {
  /** Which table to backfill. Renders its own button + label. */
  source: 'flashcards' | 'upcat_questions'
  label?: string
}

// Callers may still pass a label that leads with an emoji; the icon slot owns that job now.
const stripLeadingEmoji = (s: string) => s.replace(/^\p{Extended_Pictographic}️?\s*/u, '')

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
          notifyError(body.error ?? 'Generation failed')
          return
        }
        notifySuccess(`Generated ${body.succeeded ?? 0} · Failed ${body.failed ?? 0} · ${body.remaining ?? 0} remaining`)
      } catch {
        notifyError('Network error')
      }
    })
  }

  return (
    <Button size="sm" icon="file-pen" loading={isPending} onClick={handleClick}>
      {isPending ? 'Generating…' : stripLeadingEmoji(label ?? 'Generate explanations')}
    </Button>
  )
}
