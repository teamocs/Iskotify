import { useState, useEffect, useCallback, useRef } from 'react'
import * as Notifications from 'expo-notifications'
import RNBackgroundDownloader, { type DownloadTask } from 'react-native-background-downloader'
import { modelExists, hasEnoughRam, MODEL_PATH, MODEL_DOWNLOAD_URL } from '../services/llm'

export type ModelStatus = 'unknown' | 'absent' | 'downloading' | 'ready' | 'unsupported'

interface UseModelDownload {
  modelStatus: ModelStatus
  progress: number
  startDownload: () => void
  lastError: Error | null
}

const DOWNLOAD_ID = 'qwen-model'

async function ensureNotificationPermission(): Promise<void> {
  const { status } = await Notifications.getPermissionsAsync()
  if (status !== 'granted') {
    await Notifications.requestPermissionsAsync()
  }
}

export function useModelDownload(onDownloadComplete?: () => void): UseModelDownload {
  const [modelStatus, setModelStatus] = useState<ModelStatus>('unknown')
  const [progress, setProgress] = useState(0)
  const [lastError, setLastError] = useState<Error | null>(null)
  const taskRef = useRef<DownloadTask | null>(null)
  const isMountedRef = useRef(true)
  const completeCbRef = useRef(onDownloadComplete)

  useEffect(() => {
    completeCbRef.current = onDownloadComplete
  }, [onDownloadComplete])

  useEffect(() => {
    isMountedRef.current = true
    let cancelled = false

    async function check() {
      if (!hasEnoughRam()) {
        if (!cancelled) setModelStatus('unsupported')
        return
      }
      const exists = await modelExists()
      if (!cancelled) setModelStatus(exists ? 'ready' : 'absent')
    }
    void check()

    return () => {
      cancelled = true
      isMountedRef.current = false
      taskRef.current?.stop()
      taskRef.current = null
    }
  }, [])

  const startDownload = useCallback(() => {
    if (modelStatus === 'downloading' || modelStatus === 'ready') return

    setModelStatus('downloading')
    setProgress(0)
    setLastError(null)

    const destination = MODEL_PATH.replace(/^file:\/\//, '')

    const task = RNBackgroundDownloader.download({
      id: DOWNLOAD_ID,
      url: MODEL_DOWNLOAD_URL,
      destination,
    })
    taskRef.current = task

    task.progress(({ written, total }: { written: number; total: number }) => {
      if (!isMountedRef.current) return
      if (total > 0) setProgress(written / total)
    })

    task.done(async () => {
      if (!isMountedRef.current) return
      setModelStatus('ready')
      setProgress(1)
      taskRef.current = null
      try {
        await ensureNotificationPermission()
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

    task.error((err: Error) => {
      console.warn('[useModelDownload] download failed:', err)
      if (!isMountedRef.current) return
      setModelStatus('absent')
      setProgress(0)
      setLastError(err)
      taskRef.current = null
    })
  }, [modelStatus])

  return { modelStatus, progress, startDownload, lastError }
}
