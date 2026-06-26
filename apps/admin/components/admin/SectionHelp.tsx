'use client'

import { useState, type ReactNode } from 'react'

interface Props {
  title: string
  /** Anchor in /admin/guide to deep-link to (usually the table name). */
  guideAnchor?: string
  /** Short help text; falls back to a generic message when omitted. */
  children?: ReactNode
}

// Small "?" pill that toggles a popover with a one-liner + a link into the full guide.
export function SectionHelp({ title, guideAnchor, children }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={`Help: ${title}`}
        aria-expanded={open}
        className="w-5 h-5 rounded-full border border-black/[0.15] text-[11px] leading-none text-[#6e6e73] hover:text-[#800000] hover:border-[#800000] flex items-center justify-center"
      >
        ?
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close help"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-7 z-50 w-72 rounded-[12px] border border-black/[0.08] bg-white shadow-xl p-3 text-left">
            <p className="text-[13px] font-semibold text-[#1d1d1f] mb-1">{title}</p>
            <p className="text-[12px] text-[#6e6e73] leading-relaxed">
              {children ?? 'Add, edit, delete, import, or export rows for this table. Changes reach the mobile app on its next sync.'}
            </p>
            <a
              href={`/admin/guide${guideAnchor ? `#${guideAnchor}` : ''}`}
              className="inline-block mt-2 text-[12px] font-semibold text-[#800000] hover:underline"
            >
              Full guide →
            </a>
          </div>
        </>
      )}
    </span>
  )
}
