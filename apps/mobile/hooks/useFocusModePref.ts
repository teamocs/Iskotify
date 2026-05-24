import { useCallback, useEffect, useState } from 'react'
import { eq } from 'drizzle-orm'
import { useDb } from './useDb'
import { userSettings } from '../db/schema'

export interface UseFocusModePref {
  enabled: boolean
  setEnabled: (v: boolean) => void
  loading: boolean
}

/**
 * Read + write the persisted Focus Mode preference (`user_settings.focus_mode_enabled`).
 * Default-on: returns `enabled=true` until the DB read resolves, AND if the
 * row doesn't exist yet (fresh install before onboarding).
 */
export function useFocusModePref(): UseFocusModePref {
  const db = useDb()
  const [enabled, setEnabledState] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void db
      .select({ focusModeEnabled: userSettings.focusModeEnabled })
      .from(userSettings)
      .where(eq(userSettings.id, 1))
      .limit(1)
      .then(rows => {
        if (cancelled) return
        const row = rows[0]
        // If row exists, use its value. Otherwise default-on.
        setEnabledState(row?.focusModeEnabled ?? true)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        console.warn('[useFocusModePref] load failed:', err)
        // Keep default true; still mark loading done so UI unblocks.
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [db])

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v)  // optimistic
    void db
      .insert(userSettings)
      .values({ id: 1, focusModeEnabled: v })
      .onConflictDoUpdate({ target: userSettings.id, set: { focusModeEnabled: v } })
      .catch(err => console.warn('[useFocusModePref] persist failed:', err))
  }, [db])

  return { enabled, setEnabled, loading }
}
