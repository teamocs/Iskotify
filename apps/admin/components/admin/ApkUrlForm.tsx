'use client'

import { HostedUrlForm } from './HostedUrlForm'

interface Props {
  currentUrl: string
}

/** The first-install early-access APK link emailed by "Send APK". */
export function ApkUrlForm({ currentUrl }: Props) {
  return (
    <HostedUrlForm
      currentUrl={currentUrl}
      inputId="apk-url-input"
      label="APK download link"
      hint="Paste the permanent hosted download URL (GitHub Releases, Google Drive, etc.). Leave empty to clear it."
      placeholder="https://github.com/.../releases/download/.../iskotify-early-access.apk"
      endpoint="/api/early-access/apk-url"
      savedMessage="APK link saved successfully."
      clearedMessage="APK link cleared."
    />
  )
}
