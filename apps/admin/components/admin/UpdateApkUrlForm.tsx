'use client'

import { HostedUrlForm } from './HostedUrlForm'

interface Props {
  currentUrl: string
}

/** The APK for pushing an update to users who already installed Iskotify. */
export function UpdateApkUrlForm({ currentUrl }: Props) {
  return (
    <HostedUrlForm
      currentUrl={currentUrl}
      inputId="update-apk-url-input"
      label="Update APK download link"
      hint="Paste the permanent hosted download URL for the new update build (GitHub Releases, Google Drive, etc.). Leave empty to clear it."
      placeholder="https://github.com/.../releases/download/.../iskotify-update.apk"
      endpoint="/api/admin/update-apk-url"
      savedMessage="Update APK link saved successfully."
      clearedMessage="Update APK link cleared."
    />
  )
}
