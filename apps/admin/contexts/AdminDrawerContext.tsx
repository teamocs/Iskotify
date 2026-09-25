'use client'

import { createContext, useContext } from 'react'

interface AdminDrawerContextValue {
  openDrawer: () => void
  /** Opens the keyboard-shortcuts dialog (also bound to "?"). */
  openShortcuts: () => void
}

export const AdminDrawerContext = createContext<AdminDrawerContextValue>({
  openDrawer: () => {},
  openShortcuts: () => {},
})

export function useAdminDrawer() {
  return useContext(AdminDrawerContext)
}
