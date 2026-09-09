'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { SidebarContent } from './SidebarContent'

interface Props {
  open: boolean
  onClose: () => void
  userEmail: string
}

export function MobileSidebar({ open, onClose, userEmail }: Props) {
  const pathname = usePathname()
  const isFirstRender = useRef(true)
  const panelRef = useRef<HTMLElement>(null)
  const restoreFocusTo = useRef<HTMLElement | null>(null)

  // Close when route changes (but not on initial mount)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    onClose()
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll lock while open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  /*
   * Move focus into the drawer when it opens and hand it back to whatever
   * opened it on close. Without this a keyboard user opens the drawer and their
   * focus is still parked on the trigger behind the overlay.
   */
  useEffect(() => {
    if (open) {
      restoreFocusTo.current = document.activeElement as HTMLElement | null
      panelRef.current?.focus()
      return
    }
    restoreFocusTo.current?.focus?.()
    restoreFocusTo.current = null
  }, [open])

  /*
   * Escape closes; Tab cycles within the panel. The trap matters because the
   * page behind the overlay is still in the DOM — without it, Tab walks out of
   * the drawer and onto controls the user cannot see.
   */
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
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
  }, [open, onClose])

  return (
    /*
     * `inert` while closed is the load-bearing part: opacity-0 and
     * pointer-events-none hide the drawer visually and from the mouse, but they
     * leave every link inside it in the tab order and in the accessibility tree.
     */
    <div
      className={`md:hidden fixed inset-0 z-50 transition-opacity duration-200 ${
        open ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      inert={!open}
    >
      <div onClick={onClose} aria-hidden="true" className="absolute inset-0 bg-black/50" />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Admin navigation"
        tabIndex={-1}
        className={`absolute left-0 top-0 bottom-0 w-[280px] bg-ink flex flex-col transition-transform duration-200 focus:outline-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent userEmail={userEmail} onItemClick={onClose} />
      </aside>
    </div>
  )
}
