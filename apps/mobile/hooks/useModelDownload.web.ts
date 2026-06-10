/**
 * Web stub for useModelDownload.
 *
 * On web, llama.rn and the native background downloader are unavailable.
 * This platform file is picked up by Metro/Expo bundler when bundling for web
 * (useModelDownload.web.ts takes priority over useModelDownload.ts).
 *
 * Returns 'unsupported' status immediately — no native modules are imported.
 */

export type { ModelStatus } from './useModelDownload'

export interface UseModelDownloadResult {
  modelStatus: 'unsupported'
  progress: number
  bytesDownloaded: number
  bytesTotal: number
  startDownload: () => void
  lastError: null
}

export function useModelDownload(_onDownloadComplete?: () => void): UseModelDownloadResult {
  return {
    modelStatus: 'unsupported',
    progress: 0,
    bytesDownloaded: 0,
    bytesTotal: 0,
    startDownload: () => { /* no-op on web */ },
    lastError: null,
  }
}
