'use client'

import { useState, type ReactNode } from 'react'
import { IconButton } from '@/components/ui/Button'

interface Props {
  title: string
  /** Anchor in /admin/guide to deep-link to (usually the table name). */
  guideAnchor?: string
  /** Short help text; falls back to a generic message when omitted. */
  children?: ReactNode
}

// Small help button that toggles a popover with a one-liner + a link into the full guide.
export function SectionHelp({ title, guideAnchor, children }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex">
      <IconButton
        icon="help"
        label={`Help: ${title}`}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="h-6 w-6"
      />
      {open && (
        <>
          <button
            type="button"
            aria-label="Close help"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-7 z-50 w-72 rounded-sm border border-subtle bg-surface p-3 text-left shadow-overlay">
            <p className="mb-1 text-ui font-semibold text-ink">{title}</p>
            <p className="text-xs leading-relaxed text-ink-muted">
              {children ?? 'Add, edit, delete, import, or export rows for this table. Changes reach the mobile app on its next sync.'}
            </p>
            <a
              href={`/admin/guide${guideAnchor ? `#${guideAnchor}` : ''}`}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-maroon underline-offset-2 hover:underline"
            >
              Full guide
            </a>
          </div>
        </>
      )}
    </span>
  )
}
