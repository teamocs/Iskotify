import { useState, useEffect, useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { createDownloadTask, setConfig, completeHandler } from '@kesha-antonov/react-native-background-downloader'
import type { DownloadTask } from '@kesha-antonov/react-native-background-downloader'
import { modelExists, hasEnoughRam, MODEL_PATH, MODEL_DOWNLOAD_URL } from '../services/llm'

export type ModelStatus = 'unknown' | 'absent' | 'downloading' | 'ready' | 'unsupported'

interface UseModelDownload {
  modelStatus: ModelStatus
  progress: number
  bytesDownloaded: number
  bytesTotal: number
  startDownload: () => void
  lastError: Error | null
}

const DOWNLOAD_ID = 'qwen-model'

let nativeConfigured = false
function ensureNativeConfigured(): void {
  if (nativeConfigured) return
  nativeConfigured = true
  try {
    setConfig({
      showNotificationsEnabled: true,
      progressInterval: 500,
      progressMinBytes: 256 * 1024,
      notificationsGrouping: {
        enabled: false,
        texts: {
          downloadTitle: 'Iskotify · AI Reviewer Engine',
          downloadStarting: 'Preparing download…',
          downloadProgress: 'Downloading… {progress}%',
          downloadFinished: 'AI Reviewer ready',
          downloadPaused: 'Paused',
        },
      },
    })
  } catch (err) {
    console.warn('[useModelDownload] setConfig failed:', err)
  }
}

async function ensureNotificationPermission(): Promise<void> {
  const { status } = await Notifications.getPermissionsAsync()
  if (status !== 'granted') {
    await Notifications.requestPermissionsAsync()
  }
}

export function useModelDownload(onDownloadComplete?: () => void): UseModelDownload {
  const [modelStatus, setModelStatus] = useState<ModelStatus>('unknown')
  const [progress, setProgress] = useState(0)
  const [bytesDownloaded, setBytesDownloaded] = useState(0)
  const [bytesTotal, setBytesTotal] = useState(0)
  const [lastError, setLastError] = useState<Error | null>(null)
  const taskRef = useRef<DownloadTask | null>(null)
  const isMountedRef = useRef(true)
  const completeCbRef = useRef(onDownloadComplete)

  useEffect(() => {
    completeCbRef.current = onDownloadComplete
  }, [onDownloadComplete])

  // Cleanup on unmount only — runs once
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      taskRef.current?.stop()
      taskRef.current = null
    }
  }, [])

  // Re-check model status on every screen focus (so Home reflects model
  // downloads that happened on Practice tab without remounting)
  useFocusEffect(
    useCallback(() => {
      // Don't clobber in-flight download state
      if (modelStatus === 'downloading') return

      let cancelled = false
      async function check() {
        if (!hasEnoughRam()) {
          if (!cancelled && isMountedRef.current) setModelStatus('unsupported')
          return
        }
        const exists = await modelExists()
        if (!cancelled && isMountedRef.current) setModelStatus(exists ? 'ready' : 'absent')
      }
      void check()
      return () => { cancelled = true }
    }, [modelStatus])
  )

  const startDownload = useCallback(() => {
    if (modelStatus === 'downloading' || modelStatus === 'ready') return

    ensureNativeConfigured()
    void ensureNotificationPermission()

    setModelStatus('downloading')
    setProgress(0)
    setBytesDownloaded(0)
    setBytesTotal(0)
    setLastError(null)

    const destination = MODEL_PATH.replace(/^file:\/\//, '')

    const task = createDownloadTask({
      id: DOWNLOAD_ID,
      url: MODEL_DOWNLOAD_URL,
      destination,
    })
    taskRef.current = task

    task.begin(({ expectedBytes }) => {
      if (!isMountedRef.current) return
      if (expectedBytes > 0) setBytesTotal(expectedBytes)
    })

    task.progress(({ bytesDownloaded, bytesTotal }) => {
      if (!isMountedRef.current) return
      setBytesDownloaded(bytesDownloaded)
      if (bytesTotal > 0) {
        setBytesTotal(bytesTotal)
        setProgress(bytesDownloaded / bytesTotal)
      }
    })

    task.done(async ({ bytesTotal }) => {
      try { completeHandler(DOWNLOAD_ID) } catch { /* iOS-only handle; safe to ignore on Android */ }
      if (!isMountedRef.current) return
      setModelStatus('ready')
      setProgress(1)
      if (bytesTotal > 0) {
        setBytesDownloaded(bytesTotal)
        setBytesTotal(bytesTotal)
      }
      taskRef.current = null
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'AI Reviewer is ready!',
            body: 'Your flashcards are now being enhanced in the background.',
          },
          trigger: null,
        })
      } catch (err) {
        console.warn('[useModelDownload] notification failed:', err)
      }
      completeCbRef.current?.()
    })

    task.error(({ error, errorCode }) => {
      try { completeHandler(DOWNLOAD_ID) } catch { /* iOS-only handle; safe to ignore on Android */ }
      const wrapped = new Error(`Download failed (code ${errorCode}): ${error}`)
      console.warn('[useModelDownload] download failed:', wrapped)
      if (!isMountedRef.current) return
      setModelStatus('absent')
      setProgress(0)
      setBytesDownloaded(0)
      setBytesTotal(0)
      setLastError(wrapped)
      taskRef.current = null
    })

    task.start()
  }, [modelStatus])

  return { modelStatus, progress, bytesDownloaded, bytesTotal, startDownload, lastError }
}
