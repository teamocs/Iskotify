import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { createDownloadTask, setConfig, completeHandler, getExistingDownloadTasks } from '@kesha-antonov/react-native-background-downloader'
import type { DownloadTask } from '@kesha-antonov/react-native-background-downloader'
import * as FileSystem from 'expo-file-system/legacy'
import { modelExists, hasEnoughRam, ensureModelDirectory, MODEL_PATH, MODEL_FILENAME, MODEL_DOWNLOAD_URL, resolveDownloadUrl } from '../services/llm'

const MODEL_DIR = `${FileSystem.documentDirectory}models/`

export type ModelStatus = 'unknown' | 'absent' | 'downloading' | 'ready' | 'unsupported'

interface UseModelDownload {
  modelStatus: ModelStatus
  progress: number
  bytesDownloaded: number
  bytesTotal: number
  startDownload: () => void
  lastError: Error | null
}

const DOWNLOAD_ID = 'gemma-model'
// Legacy ID from before the Qwen → Gemma model swap; cancel any stale task on startup
const LEGACY_DOWNLOAD_IDS = ['qwen-model']

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
          downloadTitle: 'Iskotify · AI Features',
          downloadStarting: 'Preparing download…',
          downloadProgress: 'Downloading… {progress}%',
          downloadFinished: 'AI Features are ready',
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

type StateSetter<T> = React.Dispatch<React.SetStateAction<T>>

function attachHandlers(
  task: DownloadTask,
  isMountedRef: React.MutableRefObject<boolean>,
  taskRef: React.MutableRefObject<DownloadTask | null>,
  setModelStatus: StateSetter<ModelStatus>,
  setProgress: StateSetter<number>,
  setBytesDownloaded: StateSetter<number>,
  setBytesTotal: StateSetter<number>,
  setLastError: StateSetter<Error | null>,
  completeCbRef: React.MutableRefObject<(() => void) | undefined>,
): void {
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
          title: 'AI Features are ready!',
          body: 'Your app now has AI-enhanced flashcards and smarter offline search.',
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

  // Runs once on mount — cancel legacy Qwen tasks; reconnect to any
  // already-running Gemma download so navigation doesn't lose progress.
  useEffect(() => {
    isMountedRef.current = true

    getExistingDownloadTasks().then(tasks => {
      for (const task of tasks) {
        if (LEGACY_DOWNLOAD_IDS.includes(task.id)) {
          task.stop().catch(() => {})
        }
      }

      // Reconnect JS handlers to an in-progress Gemma download.
      // The native download keeps running when the component unmounts;
      // we just need to reattach callbacks so the UI reflects real progress.
      const active = tasks.find(t => t.id === DOWNLOAD_ID)
      if (active && isMountedRef.current) {
        taskRef.current = active
        setModelStatus('downloading')
        attachHandlers(active, isMountedRef, taskRef, setModelStatus, setProgress, setBytesDownloaded, setBytesTotal, setLastError, completeCbRef)
      }
    }).catch(() => {})

    return () => {
      isMountedRef.current = false
      // Do NOT stop the native download on unmount — background downloads
      // must survive tab navigation. Only the JS callbacks are torn down.
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

    // Step 0 — delete every stale *.gguf in the models dir before the new
    //           download starts. Covers the old Q4_K_M Gemma 3 (~750 MB) and
    //           the 3.4 GB Gemma 4 E2B. Fire-and-forget (non-blocking).
    FileSystem.readDirectoryAsync(MODEL_DIR)
      .then(files => {
        for (const name of files) {
          if (name.endsWith('.gguf') && name !== MODEL_FILENAME) {
            const stalePath = `${MODEL_DIR}${name}`
            FileSystem.deleteAsync(stalePath, { idempotent: true })
              .then(() => console.log('[useModelDownload] deleted stale model:', name))
              .catch(err => console.warn('[useModelDownload] stale-model delete failed:', name, err))
          }
        }
      })
      .catch(() => {})

    // Step 1 — ensure the models/ directory exists.
    // Step 2 — pre-resolve the final CDN URL before handing it to the native downloader.
    //           Android's DownloadManager silently fails when HuggingFace's multi-hop
    //           302 → LFS → S3 redirect chain is involved.  Following the redirects in JS
    //           first lets us pass a direct S3 URL to createDownloadTask.
    void ensureModelDirectory()
      .then(async () => {
        if (!isMountedRef.current) return

        // Resolve the final download URL (follows HuggingFace redirects in JS)
        let resolvedUrl = MODEL_DOWNLOAD_URL
        try {
          // Race the URL resolution against a 15-second timeout
          const timeoutPromise = new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('URL resolution timed out')), 15_000)
          )
          resolvedUrl = await Promise.race([resolveDownloadUrl(), timeoutPromise])
          console.log('[useModelDownload] resolved URL:', resolvedUrl)
        } catch (err) {
          console.warn('[useModelDownload] URL resolution failed, using original URL:', err)
          resolvedUrl = MODEL_DOWNLOAD_URL
        }

        if (!isMountedRef.current) return

        const task = createDownloadTask({ id: DOWNLOAD_ID, url: resolvedUrl, destination })
        taskRef.current = task
        attachHandlers(task, isMountedRef, taskRef, setModelStatus, setProgress, setBytesDownloaded, setBytesTotal, setLastError, completeCbRef)
        task.start()
        console.log('[useModelDownload] download started →', resolvedUrl)
      })
      .catch(err => {
        console.warn('[useModelDownload] failed to prepare download:', err)
        if (!isMountedRef.current) return
        setModelStatus('absent')
        setLastError(new Error(`Could not prepare download: ${(err as Error).message ?? err}`))
      })
  }, [modelStatus])

  return { modelStatus, progress, bytesDownloaded, bytesTotal, startDownload, lastError }
}
