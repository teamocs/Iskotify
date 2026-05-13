import React, { createContext, useMemo } from 'react'
import { useSQLiteContext } from 'expo-sqlite'
import { createDrizzleClient, type DrizzleClient } from './client'

export const DrizzleContext = createContext<DrizzleClient | null>(null)

export function DrizzleProvider({ children }: { children: React.ReactNode }) {
  const rawDb = useSQLiteContext()
  const db = useMemo(() => createDrizzleClient(rawDb), [rawDb])
  return <DrizzleContext.Provider value={db}>{children}</DrizzleContext.Provider>
}
