import { useState, useEffect, useCallback } from 'react'
import * as Notifications from 'expo-notifications'
import RNBackgroundDownloader from 'react-native-background-downloader'
import { modelExists, hasEnoughRam, MODEL_PATH, MODEL_DOWNLOAD_URL } from '../services/llm'

export type ModelStatus = 'unknown' | 'absent' | 'downloading' | 'ready' | 'unsupported'

interface UseModelDownload {
  modelStatus: ModelStatus
  progress: number
  startDownload: () => void
}

export function useModelDownload(onDownloadComplete?: () => void): UseModelDownload {
  const [modelStatus, setModelStatus] = useState<ModelStatus>('unknown')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    async function check() {
      if (!hasEnoughRam()) { setModelStatus('unsupported'); return }
      const exists = await modelExists()
      setModelStatus(exists ? 'ready' : 'absent')
    }
    void check()
  }, [])

  const startDownload = useCallback(() => {
    setModelStatus('downloading')
    setProgress(0)

    const task = RNBackgroundDownloader.download({
      id: 'qwen-model',
      url: MODEL_DOWNLOAD_URL,
      destination: MODEL_PATH,
    })

    task.progress(({ written, total }: { written: number; total: number }) => {
      if (total > 0) setProgress(written / total)
    })

    task.done(async () => {
      setModelStatus('ready')
      setProgress(1)
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'AI Reviewer is ready!',
          body: 'Your flashcards are now being enhanced in the background.',
        },
        trigger: null,
      })
      onDownloadComplete?.()
    })

    task.error((err: Error) => {
      console.warn('[useModelDownload] download failed:', err)
      setModelStatus('absent')
      setProgress(0)
    })
  }, [onDownloadComplete])

  return { modelStatus, progress, startDownload }
}
