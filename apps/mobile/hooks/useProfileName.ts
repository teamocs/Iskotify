import { useEffect, useState } from 'react'
import { eq } from 'drizzle-orm'
import { useDb } from './useDb'
import { userSettings } from '../db/schema'
import type { DrizzleClient } from '../db/client'
import { cachedQuery, subscribe } from '../services/queryCache'

// Under the 'settings:' prefix so updateSettings() → invalidate('settings:')
// re-reads it and pushes the new name to every mounted header.
const KEY = 'settings:profileName'

// Shared across every instance: each tab mounts its own TabHeader, but the
// name is read once per session and fanned out from here.
let current: string | null = null
const listeners = new Set<(name: string) => void>()
let unsubscribe: (() => void) | null = null

function publish(name: string) {
  current = name
  for (const listener of listeners) listener(name)
}

async function readName(db: DrizzleClient): Promise<string> {
  const rows = await db
    .select({ fullName: userSettings.fullName })
    .from(userSettings)
    .where(eq(userSettings.id, 1))
    .limit(1)
  return rows?.[0]?.fullName ?? ''
}

/**
 * The student's full name for the header avatar. One cached local read per
 * session, shared by every caller and refreshed when settings change; never
 * throws (a missing row or an unready DB just yields '' → the avatar shows a
 * person glyph). Pass `enabled=false` when the caller already has the name.
 */
export function useProfileName(enabled = true): string {
  const db = useDb()
  const [name, setName] = useState(() => (enabled ? current ?? '' : ''))

  useEffect(() => {
    if (!enabled) return
    listeners.add(setName)
    unsubscribe ??= subscribe(KEY, (value) => publish(typeof value === 'string' ? value : ''))
    if (current !== null) {
      setName(current)
    } else {
      // Infinity TTL: fresh until invalidated. Concurrent first mounts share
      // one in-flight read.
      cachedQuery(KEY, Infinity, () => readName(db)).then(publish, () => {
        /* no name yet — the avatar falls back to a glyph; next mount retries */
      })
    }
    return () => { listeners.delete(setName) }
  }, [db, enabled])

  return name
}

/** Test-only: forget the shared name and subscription. */
export function _resetProfileNameForTests(): void {
  current = null
  listeners.clear()
  unsubscribe?.()
  unsubscribe = null
}
