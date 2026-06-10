import React, { createContext, useMemo, useState, useEffect } from 'react'
import { Platform } from 'react-native'
import { useSQLiteContext } from 'expo-sqlite'
import { createDrizzleClient, type DrizzleClient } from './client'
import { registerWebPersist } from './webPersist'

// Re-export so callers can import from the canonical db entry point on native.
export { scheduleWebPersist } from './webPersist'

export const DrizzleContext = createContext<DrizzleClient | null>(null)

// ── Native DrizzleProvider (unchanged behaviour) ─────────────────────────────

function NativeDrizzleProvider({ children }: { children: React.ReactNode }) {
  const rawDb = useSQLiteContext()
  const db = useMemo(() => createDrizzleClient(rawDb), [rawDb])
  return <DrizzleContext.Provider value={db}>{children}</DrizzleContext.Provider>
}

// ── Web DrizzleProvider ───────────────────────────────────────────────────────
// On web, SQLiteProvider / expo-sqlite are unavailable. We async-init the
// sql.js-based web database and expose the same DrizzleContext contract.
// The loading splash is shown until the db is ready (mirrors native behaviour
// where SQLiteProvider shows nothing until the DB file is open).

function WebDrizzleProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DrizzleClient | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { openWebDatabase, makeIndexedDbStore } = await import('./web/openWebDatabase')
        const handle = await openWebDatabase(makeIndexedDbStore())
        if (cancelled) return
        // Register the scheduler so services can call scheduleWebPersist()
        registerWebPersist(handle.schedulePersist)
        setDb(handle.db as unknown as DrizzleClient)
      } catch (err) {
        console.error('[DrizzleProvider] web db init failed:', err)
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (!db) {
    // Loading state — render nothing (the root layout's loading overlay is
    // already visible at this point, shown until appReady + fontsReady).
    return null
  }

  return <DrizzleContext.Provider value={db}>{children}</DrizzleContext.Provider>
}

// ── Public DrizzleProvider (auto-selects by Platform) ────────────────────────

export function DrizzleProvider({ children }: { children: React.ReactNode }) {
  if (Platform.OS === 'web') {
    return <WebDrizzleProvider>{children}</WebDrizzleProvider>
  }
  return <NativeDrizzleProvider>{children}</NativeDrizzleProvider>
}
