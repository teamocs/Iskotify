'use client'

import { useState } from 'react'
import { Toaster } from 'sonner'
import { Sidebar } from './Sidebar'
import { MobileSidebar } from './MobileSidebar'
import { AdminDrawerContext } from '../../contexts/AdminDrawerContext'
import { PageTransition } from './PageTransition'

interface Props {
  userEmail: string
  children: React.ReactNode
}

// `unstyled` hands every visual decision to `classNames` below so the toasts
// use the same maroon design-system tokens as the rest of the admin console
// instead of sonner's own inline default styling — see DESIGN.md's rule that
// no raw colour values are allowed in a component.
const TOAST_OPTIONS = {
  unstyled: true,
  classNames: {
    toast:
      'flex items-center gap-3 w-full rounded-[16px] border border-black/[0.06] bg-white px-4 py-3 shadow-card font-body text-sm text-ink',
    title: 'font-medium',
    description: 'text-ink-muted',
    success: 'bg-success-soft text-success-strong',
    error: 'bg-danger-soft text-danger-strong',
    warning: 'bg-warning-soft text-warning-strong',
    info: 'bg-info-soft text-info-strong',
    closeButton: 'bg-white border border-black/[0.08] text-ink-subtle hover:text-ink',
  },
}

export function AdminShell({ userEmail, children }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <AdminDrawerContext.Provider value={{ openDrawer: () => setDrawerOpen(true) }}>
      <div className="flex h-screen overflow-hidden bg-surface-2">
        <Sidebar userEmail={userEmail} />
        <MobileSidebar
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          userEmail={userEmail}
        />
        <PageTransition>
          {children}
        </PageTransition>
      </div>
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
