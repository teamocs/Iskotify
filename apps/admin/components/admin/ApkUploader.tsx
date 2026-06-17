'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'success' }
  | { status: 'error'; message: string }

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ApkUploader() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' })

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null
    setFile(selected)
    // Clear any previous result so the UI resets cleanly on new file selection
    setUploadState({ status: 'idle' })
  }

  async function handleUpload() {
    if (!file) return

    // Client-side validation: only .apk files accepted
    if (!file.name.toLowerCase().endsWith('.apk')) {
      setUploadState({ status: 'error', message: 'File must be an .apk file.' })
      return
    }

    setUploadState({ status: 'uploading' })

    // Step 1: ask the server to mint a signed upload URL (service-role stays server-side)
    let path: string
    let token: string
    try {
      const res = await fetch('/api/early-access/apk-upload-url', { method: 'POST' })
      const json = (await res.json()) as {
        ok: boolean
        path?: string
        token?: string
        error?: string
      }
      if (!json.ok || !json.path || !json.token) {
        setUploadState({
          status: 'error',
          message: json.error ?? 'Failed to get upload URL. Please try again.',
        })
        return
      }
      path = json.path
      token = json.token
    } catch {
      setUploadState({ status: 'error', message: 'Network error. Check your connection and try again.' })
      return
    }

    // Step 2: upload the file directly from the browser to Supabase Storage.
    // uploadToSignedUrl(path, token, file) does not require an authenticated session —
    // the signed token is the sole credential. The service-role key is never exposed.
    const { error: uploadError } = await supabase.storage
      .from('early-access-apk')
      .uploadToSignedUrl(path, token, file, {
        contentType: 'application/vnd.android.package-archive',
        upsert: true,
      })

    if (uploadError) {
      setUploadState({
        status: 'error',
        message: `Upload failed: ${uploadError.message}`,
      })
      return
    }

    setUploadState({ status: 'success' })
    // Refresh the server component so the APK-present banner updates without a full page reload
    router.refresh()
  }

  const isUploading = uploadState.status === 'uploading'
  const isSuccess = uploadState.status === 'success'

  return (
    <div className="rounded-[12px] border border-black/[0.07] bg-[#fafafa] px-4 py-3 space-y-3">
      <p className="text-[12px] font-semibold text-[#1d1d1f] uppercase tracking-wide">
        Upload APK
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {/* Visually-hidden real file input for accessibility */}
        <label
          htmlFor="apk-file-input"
          className={[
            'cursor-pointer rounded-[8px] border px-3 py-1.5 text-[12px] font-medium transition-colors',
            isUploading
              ? 'border-black/10 text-[#aeaeb2] cursor-not-allowed bg-white'
              : 'border-black/[0.12] text-[#1d1d1f] bg-white hover:bg-[#f0f0f0]',
          ].join(' ')}
        >
          {file ? 'Change file' : 'Choose APK file'}
        </label>
        <input
          ref={inputRef}
          id="apk-file-input"
          type="file"
          accept=".apk,application/vnd.android.package-archive"
          className="sr-only"
          disabled={isUploading}
          onChange={handleFileChange}
          aria-label="Select APK file to upload"
        />

        {file && (
          <span className="text-[12px] text-[#6e6e73] truncate max-w-[260px]">
            {file.name}
            <span className="ml-1.5 text-[#aeaeb2]">({formatMB(file.size)})</span>
          </span>
        )}
      </div>

      {file && !isSuccess && (
        <button
          type="button"
          onClick={handleUpload}
          disabled={isUploading}
          className={[
            'rounded-[980px] px-4 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-60',
            'bg-[#800000] text-white hover:bg-[#a00000]',
          ].join(' ')}
        >
          {isUploading ? (
            <span className="flex items-center gap-1.5">
              <SpinnerIcon />
              Uploading&hellip; large files may take a minute
            </span>
          ) : (
            'Upload APK'
          )}
        </button>
      )}

      {/* Accessible live region for status messages */}
      <div aria-live="polite" aria-atomic="true">
        {uploadState.status === 'error' && (
          <p className="text-[12px] text-red-600 bg-red-50 rounded-[8px] px-3 py-2" role="alert">
            {uploadState.message}
          </p>
        )}
        {isSuccess && (
          <p className="text-[12px] text-green-700 bg-green-50 rounded-[8px] px-3 py-2">
            APK uploaded successfully. The banner above will reflect the new file.
          </p>
        )}
        {isUploading && (
          <p className="text-[12px] text-[#6e6e73]">
            Uploading&hellip; large files may take a minute.
          </p>
        )}
      </div>
    </div>
  )
}

function SpinnerIcon() {
  return (
    <svg
      className="inline-block h-3 w-3 animate-spin"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}
