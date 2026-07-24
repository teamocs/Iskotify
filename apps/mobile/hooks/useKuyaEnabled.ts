import { useEffect, useRef, useState } from 'react'
import { useDb } from './useDb'
import { getAiConfig } from '../services/aiConfig'

export interface UseKuyaEnabled {
  /** True only once the remote config has been read AND explicitly says enabled. */
  enabled: boolean
  loading: boolean
}

/**
 * Kuya Baw kill-switch gate. Reads the (cached, 300s TTL) remote AI chat config
 * and reports whether chat is enabled. Fail-closed: while loading, and on any
 * read failure, `enabled` stays false — entry points must not flash open then
 * hide once the real value arrives.
 */
export function useKuyaEnabled(): UseKuyaEnabled {
  const db = useDb()
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    setLoading(true)
    void getAiConfig(db)
      .then((cfg) => {
        if (!isMountedRef.current) return
        setEnabled(cfg.chatEnabled)
      })
      .catch(() => {
        if (!isMountedRef.current) return
        setEnabled(false)
      })
      .finally(() => {
        if (!isMountedRef.current) return
        setLoading(false)
      })
    return () => {
      isMountedRef.current = false
    }
  }, [db])

  return { enabled, loading }
}
