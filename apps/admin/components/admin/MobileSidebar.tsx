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

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  return (
    <div
      className={`md:hidden fixed inset-0 z-50 transition-opacity duration-200 ${
        open ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div onClick={onClose} className="absolute inset-0 bg-black/50" />
      <aside
        className={`absolute left-0 top-0 bottom-0 w-[280px] bg-[#1d1d1f] flex flex-col transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent userEmail={userEmail} onItemClick={onClose} />
      </aside>
    </div>
  )
}
