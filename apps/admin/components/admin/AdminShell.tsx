'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { MobileSidebar } from './MobileSidebar'
import { AdminDrawerContext } from '../../contexts/AdminDrawerContext'

interface Props {
  userEmail: string
  children: React.ReactNode
}

export function AdminShell({ userEmail, children }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <AdminDrawerContext.Provider value={{ openDrawer: () => setDrawerOpen(true) }}>
      <div className="flex h-screen overflow-hidden bg-[#f5f5f7]">
        <Sidebar userEmail={userEmail} />
        <MobileSidebar
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          userEmail={userEmail}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </AdminDrawerContext.Provider>
  )
}
