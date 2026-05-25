'use client'

import { SyncNowButton } from './SyncNowButton'
import { useAdminDrawer } from '../../contexts/AdminDrawerContext'

interface Props {
  title: string
  showSyncButton?: boolean
}

export function Topbar({ title, showSyncButton = false }: Props) {
  const { openDrawer } = useAdminDrawer()

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-4 md:px-6 h-[52px] bg-white/90 backdrop-blur-[20px] saturate-[180%] border-b border-black/[0.08] flex-shrink-0">
      <div className="flex items-center gap-2">
        <button
          onClick={openDrawer}
          aria-label="Open menu"
          className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center hover:bg-[#f5f5f7] -ml-1.5"
        >
          <span className="text-xl">☰</span>
        </button>
        <h1 className="font-heading font-bold text-[15px] md:text-[17px] text-[#1d1d1f] tracking-tight">
          {title}
        </h1>
      </div>
      {showSyncButton && (
        <div className="flex items-center gap-2">
          <button className="rounded-[980px] px-4 py-1.5 text-[13px] font-medium border border-black/[0.08] text-[#1d1d1f] bg-white hover:bg-[#f5f5f7] transition-colors shadow-sm">
            ⬇ Export CSV
          </button>
          <SyncNowButton />
        </div>
      )}
    </header>
  )
}
