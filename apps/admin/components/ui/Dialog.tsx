'use client'

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from './Button'
import { useFocusTrap } from './useFocusTrap'

export interface OverlayProps {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  footer?: ReactNode
  initialFocusRef?: RefObject<HTMLElement | null>
  children: ReactNode
}

/** Render into <body> once mounted, so no transformed ancestor can clip a fixed overlay. */
export function useBodyPortal() {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  useEffect(() => { setTarget(document.body) }, [])
  return (node: ReactNode) => (target ? createPortal(node, target) : node)
}

/** Body scroll stays put behind an open overlay. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [active])
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' } as const

/**
 * A centred modal. Labelled by its title, described by `description`,
 * aria-modal, focus trapped and restored, Escape and the scrim dismiss it.
 * Use `role="alertdialog"` for destructive confirmations.
 */
export function Dialog({ open, onClose, title, description, footer, initialFocusRef, children, role = 'dialog', size = 'md' }: OverlayProps & {
  role?: 'dialog' | 'alertdialog'
  size?: keyof typeof SIZES
}) {
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const portal = useBodyPortal()
  useFocusTrap({ active: open, containerRef: panelRef, onEscape: onClose, initialFocusRef })
  useScrollLock(open)

  if (!open) return null

  return portal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-scrim" />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`relative w-full ${SIZES[size]} max-h-[calc(100vh-2rem)] flex flex-col rounded-lg bg-surface shadow-overlay focus:outline-none`}
      >
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-heading font-semibold text-[17px] leading-6 text-ink">{title}</h2>
            {description && <p id={descId} className="text-ui text-ink-muted mt-1">{description}</p>}
          </div>
          <IconButton icon="x" label="Close" onClick={onClose} className="-mr-2 -mt-1" />
        </div>
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-subtle px-5 py-3">{footer}</div>}
      </div>
    </div>,
  )
}
