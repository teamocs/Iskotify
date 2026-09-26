'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Toaster } from 'sonner'
import { Sidebar } from './Sidebar'
import { MobileSidebar } from './MobileSidebar'
import { AdminDrawerContext } from '../../contexts/AdminDrawerContext'
import { PageTransition } from './PageTransition'
import { KeyboardShortcuts } from './KeyboardShortcuts'
import { ShortcutsDialog } from './ShortcutsDialog'
import { isToggleSidebarShortcut, sidebarCookie } from '@/lib/nav/sidebarState'
import type { NavBadges } from '@/lib/admin/navBadges'

interface Props {
  userEmail: string
  /** Read from the sidebar cookie by the server layout, so the first paint is already right. */
  defaultCollapsed?: boolean
  /** Streamed queue counts; the sidebar renders before they arrive. */
  badges?: Promise<NavBadges>
  children: React.ReactNode
}

/** md breakpoint: above it Ctrl/Cmd+B toggles the rail, below it the drawer. */
const DESKTOP = '(min-width: 768px)'

// `unstyled` hands every visual decision to `classNames` below so the toasts
// use the same maroon design-system tokens as the rest of the admin console
// instead of sonner's own inline default styling — see DESIGN.md's rule that
// no raw colour values are allowed in a component.
const TOAST_OPTIONS = {
  unstyled: true,
  classNames: {
    toast:
      'flex items-center gap-3 w-full rounded-md border border-subtle bg-surface px-4 py-3 shadow-card font-body text-sm text-ink',
    title: 'font-medium',
    description: 'text-ink-muted',
    success: 'bg-success-soft text-success-strong',
    error: 'bg-danger-soft text-danger-strong',
    warning: 'bg-warning-soft text-warning-strong',
    info: 'bg-info-soft text-info-strong',
    closeButton: 'bg-surface border border-subtle text-ink-subtle hover:text-ink',
  },
}

export function AdminShell({ userEmail, defaultCollapsed = false, badges, children }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [lastBadges, setLastBadges] = useState<NavBadges | undefined>(undefined)

  // Remember the latest resolved counts: while a refreshed promise is pending,
  // the sidebar keeps showing these instead of dropping every badge.
  useEffect(() => {
    let live = true
    badges?.then(b => { if (live) setLastBadges(b) })
    return () => { live = false }
  }, [badges])
  const openShortcuts = useCallback(() => setShortcutsOpen(true), [])
  const ctx = useMemo(() => ({ openDrawer: () => setDrawerOpen(true), openShortcuts }), [openShortcuts])

  const toggleCollapsed = useCallback(() => setCollapsed(c => !c), [])

  // Persist every change; the layout reads the cookie on the next request.
  useEffect(() => {
    document.cookie = sidebarCookie(collapsed ? 'collapsed' : 'expanded')
  }, [collapsed])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented) return
      const { key, ctrlKey, metaKey, altKey, shiftKey } = e
      if (!isToggleSidebarShortcut({ key, ctrlKey, metaKey, altKey, shiftKey, target: e.target as HTMLElement | null })) return
      // A dialog owns the keyboard; the closed drawer is inert and does not count.
      const modals = Array.from(document.querySelectorAll('[aria-modal="true"]'))
      const blocking = modals.filter(m => !m.closest('[inert]') && m.getAttribute('aria-label') !== 'Admin navigation')
      if (blocking.length) return
      e.preventDefault()
      if (window.matchMedia(DESKTOP).matches) toggleCollapsed()
      else setDrawerOpen(o => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleCollapsed])

  return (
    <AdminDrawerContext.Provider value={ctx}>
      <div className="flex h-screen overflow-hidden bg-surface-2">
        <Sidebar userEmail={userEmail} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} badges={badges} lastBadges={lastBadges} />
        <MobileSidebar
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          userEmail={userEmail}
          badges={badges}
          lastBadges={lastBadges}
        />
        <PageTransition>
          {children}
        </PageTransition>
      </div>
      <KeyboardShortcuts onShowHelp={openShortcuts} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      {/*
       * A single Toaster for the whole admin console. `position="bottom-right"`
       * keeps it clear of the sidebar and topbar; `richColors` stays off because
       * we style success/error/warning/info from our own tokens instead
       * (`richColors` would fight `unstyled`+`classNames` with its own inline
       * colours). `closeButton` gives keyboard/mouse users an explicit dismiss
       * affordance. Sonner renders its own aria-live region internally — left
       * untouched here so screen readers still announce each toast.
       */}
      <Toaster position="bottom-right" closeButton richColors={false} toastOptions={TOAST_OPTIONS} />
    </AdminDrawerContext.Provider>
  )
}
