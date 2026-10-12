'use client'

import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { IconButton } from './Button'
import { OverlayContent, useBodyPortal, useGuardedClose, useScrollLock, type OverlayProps } from './Dialog'
import { tabbablesIn, useFocusTrap } from './useFocusTrap'
import { hasOpenTrap } from './trapStack'
import { INSPECTOR_QUERY, useMediaQuery } from './useMediaQuery'

export { closeOrConfirm, DiscardChangesDialog } from './Dialog'

const WIDTHS = { md: 'max-w-md', lg: 'max-w-xl', xl: 'max-w-3xl' } as const

/**
 * A side panel for editing a record without losing the list behind it.
 * Same modal contract as Dialog (labelled, aria-modal, trap, restore, Escape),
 * anchored right, full height, with a sticky footer for the actions. Pass
 * `onSubmit` to make it a form and `dirty` to guard unsaved edits.
 *
 * `inspector`: at `xl` and above the same content docks as a non-modal pane
 * beside the list (macOS inspector), rendered in place, so the caller lays it
 * out next to the table. Below `xl`, and on the server, it is the modal Drawer.
 */
export function Drawer({ open, onClose, title, description, footer, initialFocusRef, returnFocusRef, onSubmit, dirty = false, children, width = 'md', inspector = false }: OverlayProps & {
  width?: keyof typeof WIDTHS
  inspector?: boolean
}) {
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const portal = useBodyPortal()
  const wide = useMediaQuery(INSPECTOR_QUERY)
  const docked = inspector && wide
  const { requestClose, discard } = useGuardedClose(open, dirty, onClose)
  useFocusTrap({ active: open && !docked, containerRef: panelRef, onEscape: requestClose, initialFocusRef, returnFocusRef })
  useScrollLock(open && !docked)

  if (!open) return null

  const header = (
    <div className="flex items-start gap-3 border-b border-subtle px-5 py-4">
      <div className="min-w-0 flex-1">
        <h2 id={titleId} className="font-heading text-headline text-ink">{title}</h2>
        {description && <p id={descId} className="text-ui text-ink-muted mt-1">{description}</p>}
      </div>
      <IconButton icon="x" label="Close" onClick={requestClose} className="-mr-2" />
    </div>
  )
  const content = (
    <OverlayContent
      onSubmit={onSubmit}
      footer={footer}
      close={requestClose}
      bodyClass="min-h-0 flex-1 overflow-y-auto px-5 py-4"
      footerClass="flex flex-wrap justify-end gap-2 border-t border-subtle px-5 py-3"
    >
      {children}
    </OverlayContent>
  )

  if (docked) {
    return (
      <InspectorPane titleId={titleId} descId={description ? descId : undefined} initialFocusRef={initialFocusRef} returnFocusRef={returnFocusRef} onEscape={requestClose}>
        {header}
        {content}
        {discard}
      </InspectorPane>
    )
  }

  return portal(
    <div className="admin-type fixed inset-0 z-50">
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
        {header}
        {content}
      </div>
      {discard}
    </div>,
  )
}

/**
 * The docked form of a Drawer. Non-modal, so there is no scrim, scroll lock or
 * Tab trap: the list beside it stays usable. It still moves focus in on open,
 * closes on Escape while focus is inside, and hands focus back on close when
 * focus was still in the pane (it never yanks focus from where the user went).
 * A modal opened on top (the discard prompt) owns Escape.
 */
function InspectorPane({ titleId, descId, initialFocusRef, returnFocusRef, onEscape, children }: {
  titleId: string
  descId?: string
  initialFocusRef?: RefObject<HTMLElement | null>
  returnFocusRef?: RefObject<HTMLElement | null>
  onEscape: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  const onEscapeRef = useRef(onEscape)
  useEffect(() => { onEscapeRef.current = onEscape })

  // A native listener on the pane: only keys pressed while focus is inside it.
  // (A portalled modal on top is outside the pane's DOM, and owns its own keys.)
  useEffect(() => {
    const pane = ref.current
    if (!pane) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || hasOpenTrap()) return
      e.preventDefault()
      onEscapeRef.current()
    }
    pane.addEventListener('keydown', onKey)
    return () => pane.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const pane = ref.current
    const opened = document.activeElement as HTMLElement | null
    ;(initialFocusRef?.current ?? (pane ? tabbablesIn(pane)[0] : undefined) ?? pane)?.focus()
    return () => {
      const active = document.activeElement
      const focusWasHere = !active || active === document.body || Boolean(pane?.contains(active))
      // The explicit opener wins: Safari leaves focus on <body> after a click.
      // Read at close on purpose: the opener can change while open (a row switch).
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const explicit = returnFocusRef?.current
      const restoreTo = explicit?.isConnected ? explicit : opened
      if (focusWasHere && restoreTo?.isConnected) restoreTo.focus()
    }
  }, [initialFocusRef, returnFocusRef])

  return (
    <aside
      ref={ref}
      data-inspector=""
      aria-labelledby={titleId}
      aria-describedby={descId}
      tabIndex={-1}
      className="sticky top-0 flex max-h-[calc(100vh-7rem)] w-[26rem] shrink-0 flex-col overflow-hidden rounded-group border border-subtle bg-surface focus:outline-none 2xl:w-[30rem]"
    >
      {children}
    </aside>
  )
}
