import { useState, useEffect, useCallback } from 'react'
import { eq } from 'drizzle-orm'
import { useDb } from './useDb'
import { userSettings } from '../db/schema'
import { connectGoogleCalendar, disconnectGoogleCalendar } from '../services/googleCalendar'

export function useGoogleCalendar() {
  const db = useDb()
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const rows = await db.select({ c: userSettings.googleCalendarConnected })
      .from(userSettings).where(eq(userSettings.id, 1)).limit(1)
    setConnected(!!rows[0]?.c)
  }, [db])

  useEffect(() => { void refresh() }, [refresh])

  const connect = useCallback(async () => {
    setBusy(true)
    try {
      const ok = await connectGoogleCalendar(db)
      await refresh()
      return ok
    } finally { setBusy(false) }
  }, [db, refresh])

  const disconnect = useCallback(async () => {
    setBusy(true)
    try {
      await disconnectGoogleCalendar(db)
      await refresh()
    } finally { setBusy(false) }
  }, [db, refresh])

  return { connected, busy, connect, disconnect }
}
