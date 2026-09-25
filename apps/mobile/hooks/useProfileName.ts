import { useEffect, useState } from 'react'
import { eq } from 'drizzle-orm'
import { useDb } from './useDb'
import { userSettings } from '../db/schema'

/**
 * The student's full name for the header avatar. One small local read; never
 * throws (a missing row or an unready DB just yields '' → the avatar shows a
 * person glyph). Pass `enabled=false` when the caller already has the name.
 */
export function useProfileName(enabled = true): string {
  const db = useDb()
  const [name, setName] = useState('')

  useEffect(() => {
    if (!enabled) return
    let alive = true
    ;(async () => {
      try {
        const rows = await db
          .select({ fullName: userSettings.fullName })
          .from(userSettings)
          .where(eq(userSettings.id, 1))
          .limit(1)
        if (alive) setName(rows?.[0]?.fullName ?? '')
      } catch {
        /* no name yet — the avatar falls back to a glyph */
      }
    })()
    return () => { alive = false }
  }, [db, enabled])

  return name
}
