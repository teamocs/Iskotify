'use client'

import { createContext, useContext } from 'react'

interface AdminDrawerContextValue {
  openDrawer: () => void
}

export const AdminDrawerContext = createContext<AdminDrawerContextValue>({
  openDrawer: () => {},
})

export function useAdminDrawer() {
  return useContext(AdminDrawerContext)
}
