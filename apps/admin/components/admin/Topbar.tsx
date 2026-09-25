'use client'

import type { ReactNode } from 'react'
import { SyncNowButton } from './SyncNowButton'
import { ExportButtons } from './ExportButtons'
import { useAdminDrawer } from '../../contexts/AdminDrawerContext'
import { IconButton } from '@/components/ui/Button'

interface Props {
  /** The page's one h1. Pages should not repeat it as their own heading. */
  title: string
  showSyncButton?: boolean
  /** When set, renders CSV/JSON export links (e.g. "/api/admin/listings/export"). */
  exportHref?: string
  /** Page-level actions, right-aligned. */
  actions?: ReactNode
}

export function Topbar({ title, showSyncButton = false, exportHref, actions }: Props) {
  const { openDrawer, openShortcuts } = useAdminDrawer()

  return (
    <header className="sticky top-0 z-40 flex h-[52px] flex-shrink-0 items-center gap-2 border-b border-subtle bg-surface px-4 md:px-6">
      <IconButton icon="menu" label="Open navigation" onClick={openDrawer} size="md" className="-ml-2 md:hidden" />
      <h1 className="min-w-0 flex-1 truncate font-heading text-[17px] font-semibold tracking-tight text-ink">
        {title}
      </h1>
      <div className="flex items-center gap-2">
        {actions}
        {exportHref && <ExportButtons baseHref={exportHref} />}
        {showSyncButton && <SyncNowButton />}
        <IconButton icon="keyboard" label="Keyboard shortcuts" onClick={openShortcuts} className="hidden sm:inline-flex" />
      </div>
    </header>
  )
}
