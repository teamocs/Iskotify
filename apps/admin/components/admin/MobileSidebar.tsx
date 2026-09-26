'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { SidebarContent } from './SidebarContent'
import { useFocusTrap } from '@/components/ui/useFocusTrap'
import { useScrollLock } from '@/components/ui/Dialog'
import type { NavBadges } from '@/lib/admin/navBadges'

interface Props {
  open: boolean
  onClose: () => void
  userEmail: string
  badges?: Promise<NavBadges>
  lastBadges?: NavBadges
}

/** The same SidebarContent as desktop, always expanded, as a modal drawer. */
export function MobileSidebar({ open, onClose, userEmail, badges, lastBadges }: Props) {
  const pathname = usePathname()
  const isFirstRender = useRef(true)
  const panelRef = useRef<HTMLElement>(null)

  // Close when route changes (but not on initial mount)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    onClose()
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  useScrollLock(open)

  /*
   * Focus moves to the panel on open and back to the trigger on close; Tab is
   * trapped and Escape closes. The same contract as the Dialog/Drawer
   * primitives — the logic now lives in components/ui/useFocusTrap.
   */
  useFocusTrap({ active: open, containerRef: panelRef, onEscape: onClose, initialFocusRef: panelRef })

  return (
    /*
     * `inert` while closed is the load-bearing part: opacity-0 and
     * pointer-events-none hide the drawer visually and from the mouse, but they
     * leave every link inside it in the tab order and in the accessibility tree.
     */
    <div
      className={`md:hidden fixed inset-0 z-50 transition-opacity duration-200 motion-reduce:transition-none ${
        open ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      inert={!open}
    >
      <div onClick={onClose} aria-hidden="true" className="absolute inset-0 bg-scrim" />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Admin navigation"
        tabIndex={-1}
        className={`absolute left-0 top-0 bottom-0 flex w-[min(288px,85vw)] flex-col bg-sidebar pb-[env(safe-area-inset-bottom)] shadow-overlay transition-transform duration-200 ease-out motion-reduce:transition-none focus:outline-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent userEmail={userEmail} badges={badges} lastBadges={lastBadges} onItemClick={onClose} onClose={onClose} />
      </aside>
    </div>
  )
}
