'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { pushTrap, popTrap, isTopTrap } from './trapStack'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Where Tab should land, or null to let the browser move focus normally.
 * `current` is the index of the focused element among the focusables, or -1
 * when focus is outside the container (e.g. on the panel itself).
 */
export function nextFocusIndex(count: number, current: number, shift: boolean): number | null {
  if (count === 0) return null
  if (current === -1) return shift ? count - 1 : 0
  if (shift && current === 0) return count - 1
  if (!shift && current === count - 1) return 0
  return null
}

interface Options {
  active: boolean
  containerRef: RefObject<HTMLElement | null>
  onEscape: () => void
  /** Element to focus on open; defaults to the first focusable, then the container. */
  initialFocusRef?: RefObject<HTMLElement | null>
}

/**
 * The modal contract, extracted from MobileSidebar/ConfirmDialog: move focus in
 * on open, keep Tab inside, close on Escape, and hand focus back to whatever
 * opened it on close. Without the trap, Tab walks onto the page behind the
 * overlay, which is still in the DOM.
 */
export function useFocusTrap({ active, containerRef, onEscape, initialFocusRef }: Options) {
  const restoreTo = useRef<HTMLElement | null>(null)
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape
  const id = useRef(Symbol('focus-trap'))

  useEffect(() => {
    if (!active) return
    const trapId = id.current
    pushTrap(trapId)
    restoreTo.current = document.activeElement as HTMLElement | null
    const container = containerRef.current
    const first = container?.querySelector<HTMLElement>(FOCUSABLE)
    ;(initialFocusRef?.current ?? first ?? container)?.focus()

    function handleKey(e: KeyboardEvent) {
      // Only the topmost overlay owns the keyboard (see trapStack.ts).
      if (!isTopTrap(trapId)) return
      if (e.key === 'Escape') { e.stopPropagation(); onEscapeRef.current(); return }
      if (e.key !== 'Tab' || !containerRef.current) return
      const items = Array.from(containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      const target = nextFocusIndex(items.length, items.indexOf(document.activeElement as HTMLElement), e.shiftKey)
      if (target !== null) { e.preventDefault(); items[target]!.focus() }
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
      popTrap(trapId)
      restoreTo.current?.focus?.()
      restoreTo.current = null
    }
  }, [active, containerRef, initialFocusRef])
}
