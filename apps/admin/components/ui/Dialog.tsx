'use client'

import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Button, IconButton } from './Button'
import { useFocusTrap } from './useFocusTrap'

/** A footer can take the guarded close, so its Cancel asks before discarding edits. */
export type OverlayFooter = ReactNode | ((close: () => void) => ReactNode)

export interface OverlayProps {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  footer?: OverlayFooter
  initialFocusRef?: RefObject<HTMLElement | null>
  /**
   * Makes the panel a real <form>: Enter in a field submits, and a footer
   * button with type="submit" is the submit. The default is prevented for you.
   * The form is `noValidate` so each Field shows its own inline error instead
   * of the browser's bubble.
   */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void
  /** Unsaved edits: closing (Escape, scrim, ✕, a guarded Cancel) asks first. */
  dirty?: boolean
  children: ReactNode
}

/** Render into <body> once mounted, so no transformed ancestor can clip a fixed overlay. */
export function useBodyPortal() {
  // False on the server and during hydration, true after: no second render pass via an effect.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)
  return (node: ReactNode) => (mounted ? createPortal(node, document.body) : node)
}

const noopSubscribe = () => () => {}

/** Body scroll stays put behind an open overlay. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [active])
}

/** The unsaved-changes rule, pure: close now, or ask first. */
export function closeOrConfirm(dirty: boolean, close: () => void, ask: () => void): void {
  if (dirty) ask()
  else close()
}

/**
 * Close handling shared by Dialog and Drawer: a guarded close that asks before
 * throwing edits away, and the browser's own leave-page prompt while dirty.
 */
export function useGuardedClose(open: boolean, dirty: boolean, onClose: () => void) {
  const [asking, setAsking] = useState(false)
  // A closed overlay forgets a pending "discard changes?" (adjusted while rendering, not in an effect).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) setAsking(false)
  }
  useEffect(() => {
    if (!open || !dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [open, dirty])
  const requestClose = () => closeOrConfirm(dirty, onClose, () => setAsking(true))
  const discard = <DiscardChangesDialog open={asking} onKeep={() => setAsking(false)} onDiscard={() => { setAsking(false); onClose() }} />
  return { requestClose, discard }
}

/** Panel body + footer, as a <form> when the overlay submits. */
export function OverlayContent({ onSubmit, footer, close, bodyClass, footerClass, children }: {
  onSubmit?: OverlayProps['onSubmit']
  footer?: OverlayFooter
  close: () => void
  bodyClass: string
  footerClass: string
  children: ReactNode
}) {
  const foot = typeof footer === 'function' ? footer(close) : footer
  const inner = (
    <>
      <div className={bodyClass}>{children}</div>
      {foot && <div className={footerClass}>{foot}</div>}
    </>
  )
  if (!onSubmit) return inner
  return (
    <form noValidate onSubmit={e => { e.preventDefault(); onSubmit(e) }} className="flex min-h-0 flex-1 flex-col">
      {inner}
    </form>
  )
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const

/**
 * A centred modal. Labelled by its title, described by `description`,
 * aria-modal, focus trapped and restored, Escape and the scrim dismiss it.
 * Use `role="alertdialog"` for destructive confirmations.
 */
export function Dialog({ open, onClose, title, description, footer, initialFocusRef, onSubmit, dirty = false, children, role = 'dialog', size = 'md' }: OverlayProps & {
  role?: 'dialog' | 'alertdialog'
  size?: keyof typeof SIZES
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" onClick={requestClose} className="absolute inset-0 bg-scrim" />
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
          <IconButton icon="x" label="Close" onClick={requestClose} className="-mr-2 -mt-1" />
        </div>
        <OverlayContent
          onSubmit={onSubmit}
          footer={footer}
          close={requestClose}
          bodyClass="min-h-0 flex-1 overflow-y-auto px-5 pb-5"
          footerClass="flex flex-wrap justify-end gap-2 border-t border-subtle px-5 py-3"
        >
          {children}
        </OverlayContent>
      </div>
      {discard}
    </div>,
  )
}

/**
 * "You have unsaved changes." Keep editing is focused first, so a stray Enter
 * never throws work away.
 */
export function DiscardChangesDialog({ open, onKeep, onDiscard }: { open: boolean; onKeep: () => void; onDiscard: () => void }) {
  const keepRef = useRef<HTMLButtonElement>(null)
  return (
    <Dialog
      open={open}
      onClose={onKeep}
      role="alertdialog"
      size="sm"
      title="Discard unsaved changes?"
      description="Your edits haven’t been saved. Closing now throws them away."
      initialFocusRef={keepRef}
      footer={
        <>
          <Button ref={keepRef} onClick={onKeep}>Keep editing</Button>
          <Button variant="danger" onClick={onDiscard}>Discard changes</Button>
        </>
      }
    >
      {null}
    </Dialog>
  )
}
