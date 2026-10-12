import { createElement, useCallback, useMemo, type ReactElement } from 'react'
import { SyncErrorBanner } from '../SyncErrorBanner'
import { useDb } from '../../hooks/useDb'
import { syncOnLaunch } from '../../services/sync'
import { useTheme } from '../../theme/ThemeContext'

export interface TabShell {
  /** The sync-error banner, drawn above the navigator. */
  syncBanner: ReactElement
  /** Re-runs the launch sync (the banner's retry). */
  retrySync: () => void
  /** The page ground behind the navigator. */
  backgroundColor: string
}

/**
 * Everything the tab layouts do besides drawing the navigator, shared by the
 * iOS native-tabs layout (app/(tabs)/_layout.ios.tsx) and the Android / web
 * floating-bar layout (app/(tabs)/_layout.tsx) so the two cannot drift.
 */
export function useTabShell(): TabShell {
  const db = useDb()
  const { theme: t } = useTheme()

  // syncOnLaunch marks start/done on the syncStatus store itself, so the
  // banner hides while the retry runs.
  const retrySync = useCallback(() => {
    void syncOnLaunch(db)
  }, [db])

  const syncBanner = useMemo(() => createElement(SyncErrorBanner, { onRetry: retrySync }), [retrySync])

  return { syncBanner, retrySync, backgroundColor: t.bg }
}
