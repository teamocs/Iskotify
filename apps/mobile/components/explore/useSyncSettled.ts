import { useEffect, useRef, useState } from 'react'
import { useSyncStatus } from '../../hooks/useSyncStatus'

/**
 * A counter that ticks each time a catalog sync finishes (isSyncing true →
 * false). Put it in a loader's dependencies so a screen that mounted before
 * the first web sync landed re-reads the local DB instead of staying empty
 * until the student navigates away and back.
 */
export function useSyncSettled(): number {
  const { isSyncing } = useSyncStatus()
  const was = useRef(isSyncing)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (was.current && !isSyncing) setTick(n => n + 1)
    was.current = isSyncing
  }, [isSyncing])
  return tick
}
