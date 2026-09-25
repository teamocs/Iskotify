'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button, buttonClass } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'

/**
 * Admin route error boundary. A failed query shows up as a named failure with a
 * retry, never as an empty page that looks like "no data". The sidebar stays,
 * because the shell lives in the layout above this boundary.
 */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <div className="flex-1 overflow-y-auto px-3 py-6 sm:px-4 md:px-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <ErrorBanner
          title="This page couldn’t load"
          message="The server didn’t answer as expected, so nothing here is shown rather than showing it empty. Try again; if it keeps failing, send the reference below to the developer."
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon="refresh" onClick={reset}>Try again</Button>
          <Link href="/admin" className={buttonClass({ variant: 'secondary' })}>Back to Home</Link>
        </div>
        {error.digest && (
          <p className="text-xs text-ink-muted">
            Reference <code className="rounded bg-neutral-soft px-1 py-0.5 font-mono text-ink">{error.digest}</code>
          </p>
        )}
      </div>
    </div>
  )
}
