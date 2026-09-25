'use client'

import { useEffect, useId, useRef } from 'react'

interface Props {
  message: string
  onConfirm: () => void
  onCancel: () => void
  /** Label for the confirming button. Defaults to "Delete". */
  confirmLabel?: string
  /** Visual tone of the confirm button. Defaults to "danger". */
  tone?: 'danger' | 'default'
}

export function ConfirmDialog({ message, onConfirm, onCancel, confirmLabel = 'Delete', tone = 'danger' }: Props) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const restoreFocusTo = useRef<HTMLElement | null>(null)

  // Move focus to the (non-destructive) cancel button on open, and hand it
  // back to whatever opened the dialog on close — same pattern as
  // MobileSidebar, which is the in-repo reference implementation.
  useEffect(() => {
    restoreFocusTo.current = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    return () => {
      restoreFocusTo.current?.focus?.()
      restoreFocusTo.current = null
    }
  }, [])

  // Escape closes (cancels); Tab is trapped inside the dialog since the page
  // behind it is still in the DOM.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onCancel(); return }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onCancel])

  const confirmCls = tone === 'danger'
    ? 'bg-danger text-white hover:bg-danger-strong'
    : 'bg-maroon text-white hover:bg-maroon-light'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="bg-white rounded-[22px] shadow-[0_32px_80px_rgba(0,0,0,0.18)] p-6 max-w-sm w-full mx-4"
      >
        <p id={titleId} className="font-heading font-bold text-[17px] text-ink mb-1">Are you sure?</p>
        <p id={descriptionId} className="text-sm text-ink-muted mb-6">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-4 py-2 rounded-[980px] text-sm font-medium border border-black/[0.08] text-ink hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-[980px] text-sm font-medium transition-colors ${confirmCls}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
