import React, { createContext, useContext } from 'react'
import type { Database } from '@nozbe/watermelondb'
import { database } from '../db'

const DatabaseContext = createContext<Database>(database)

export function DatabaseProvider({
  children,
  db = database,
}: {
  children: React.ReactNode
  db?: Database
}) {
  return <DatabaseContext.Provider value={db}>{children}</DatabaseContext.Provider>
}

export function useDatabase(): Database {
  return useContext(DatabaseContext)
}
