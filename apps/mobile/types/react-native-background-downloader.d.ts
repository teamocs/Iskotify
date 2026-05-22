declare module 'react-native-background-downloader' {
  export interface DownloadTask {
    id: string
    progress(callback: (data: { written: number; total: number }) => void): DownloadTask
    done(callback: () => void | Promise<void>): DownloadTask
    error(callback: (err: Error) => void): DownloadTask
    stop(): void
    pause(): void
    resume(): void
  }

  export interface DownloadOptions {
    id: string
    url: string
    destination: string
    headers?: Record<string, string>
  }

  interface RNBackgroundDownloader {
    download(options: DownloadOptions): DownloadTask
    checkForExistingDownloads(): Promise<DownloadTask[]>
    completeHandler(id: string): void
  }

  const RNBackgroundDownloader: RNBackgroundDownloader
  export default RNBackgroundDownloader
}
