'use client'

import { useId, useRef } from 'react'
import { IconButton } from './Button'
import { OverlayContent, useBodyPortal, useGuardedClose, useScrollLock, type OverlayProps } from './Dialog'
import { useFocusTrap } from './useFocusTrap'

export { closeOrConfirm, DiscardChangesDialog } from './Dialog'

const WIDTHS = { md: 'max-w-md', lg: 'max-w-xl', xl: 'max-w-3xl' } as const

/**
 * A side panel for editing a record without losing the list behind it.
 * Same modal contract as Dialog (labelled, aria-modal, trap, restore, Escape),
 * anchored right, full height, with a sticky footer for the actions. Pass
 * `onSubmit` to make it a form and `dirty` to guard unsaved edits.
 */
export function Drawer({ open, onClose, title, description, footer, initialFocusRef, onSubmit, dirty = false, children, width = 'md' }: OverlayProps & {
  width?: keyof typeof WIDTHS
}) {
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const portal = useBodyPortal()
  const { requestClose, discard } = useGuardedClose(open, dirty, onClose)
  useFocusTrap({ active: open, containerRef: panelRef, onEscape: requestClose, initialFocusRef })
  useScrollLock(open)

  if (!open) return null

  return portal(
    <div className="fixed inset-0 z-50">
      <div aria-hidden="true" onClick={requestClose} className="absolute inset-0 bg-scrim" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`absolute inset-y-0 right-0 flex w-full ${WIDTHS[width]} flex-col bg-surface shadow-overlay focus:outline-none`}
      >
        <div className="flex items-start gap-3 border-b border-subtle px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-heading font-semibold text-[17px] leading-6 text-ink">{title}</h2>
            {description && <p id={descId} className="text-ui text-ink-muted mt-1">{description}</p>}
          </div>
          <IconButton icon="x" label="Close" onClick={requestClose} className="-mr-2" />
        </div>
        <OverlayContent
          onSubmit={onSubmit}
          footer={footer}
          close={requestClose}
          bodyClass="min-h-0 flex-1 overflow-y-auto px-5 py-4"
          footerClass="flex flex-wrap justify-end gap-2 border-t border-subtle px-5 py-3"
        >
          {children}
        </OverlayContent>
      </div>
      {discard}
    </div>,
  )
}
