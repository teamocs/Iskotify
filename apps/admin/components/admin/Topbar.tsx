'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import { ExportButtons } from './ExportButtons'
import { useAdminDrawer } from '../../contexts/AdminDrawerContext'
import { IconButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Kbd } from '@/components/ui/Kbd'

interface Props {
  /** The page's one h1. Pages should not repeat it as their own heading. */
  title: string
  /** When set, renders CSV/JSON export links (e.g. "/api/admin/listings/export"). */
  exportHref?: string
  /** Page-level actions, right-aligned. At most one is maroon (primary). */
  actions?: ReactNode
}

const SEARCH = '[data-shortcut-search]'

// Whether the page has a search box for the "/" shortcut (DataTable's search).
// False on the server, so the affordance only appears once there is a real target.
function subscribeDom(onChange: () => void) {
  const mo = new MutationObserver(onChange)
  mo.observe(document.body, { childList: true, subtree: true })
  return () => mo.disconnect()
}
const usePageHasSearch = () =>
  useSyncExternalStore(subscribeDom, () => document.querySelector(SEARCH) !== null, () => false)

function focusPageSearch() {
  const el = document.querySelector<HTMLInputElement>(SEARCH)
  el?.focus()
  el?.select()
}

/**
 * The page's toolbar: translucent (`glass`) and sticky, holding the one h1.
 * The search control is not a second search box: it hands focus to the page's
 * own search, and shows the shortcut that already does that ("/").
 */
export function Topbar({ title, exportHref, actions }: Props) {
  const { openDrawer, openShortcuts } = useAdminDrawer()
  const hasSearch = usePageHasSearch()

  return (
    <header className="glass sticky top-0 z-40 flex h-[52px] flex-shrink-0 items-center gap-2 px-4 md:px-6">
      <IconButton icon="menu" label="Open navigation" onClick={openDrawer} size="md" className="-ml-2 md:hidden" />
      <h1 className="min-w-0 flex-1 truncate font-heading text-title-3 font-bold tracking-tight text-ink">
        {title}
      </h1>
      <div className="flex items-center gap-2">
        {hasSearch && (
          <button
            type="button"
            onClick={focusPageSearch}
            aria-keyshortcuts="/"
            className="hidden h-8 w-48 items-center gap-2 rounded-chip bg-neutral-soft px-2.5 text-ui text-ink-muted transition-colors duration-200 ease-snappy hover:text-ink lg:inline-flex"
          >
            <Icon name="search" size={14} />
            <span className="flex-1 text-left">Search</span>
            <span aria-hidden="true"><Kbd>/</Kbd></span>
          </button>
        )}
        {actions}
        {exportHref && <ExportButtons baseHref={exportHref} />}
        <IconButton icon="keyboard" label="Keyboard shortcuts" onClick={openShortcuts} className="hidden sm:inline-flex" />
      </div>
    </header>
  )
}
