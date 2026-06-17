import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// Mock next/navigation (used by ApkUploader for router.refresh)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

// Mock @supabase/ssr so createBrowserClient doesn't blow up in a server render
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({
    storage: {
      from: (_bucket: string) => ({
        uploadToSignedUrl: vi.fn(),
      }),
    },
  })),
}))

import { ApkUploader } from '../ApkUploader'

describe('ApkUploader', () => {
  it('renders a file input with accept=".apk"', () => {
    const html = renderToStaticMarkup(React.createElement(ApkUploader))
    expect(html).toContain('type="file"')
    expect(html).toContain('.apk')
  })

  it('renders the "Choose APK file" label', () => {
    const html = renderToStaticMarkup(React.createElement(ApkUploader))
    expect(html).toContain('Choose APK file')
  })

  it('renders an accessible label for the file input', () => {
    const html = renderToStaticMarkup(React.createElement(ApkUploader))
    expect(html).toContain('apk-file-input')
    // The <label> element should reference the input via htmlFor
    expect(html).toContain('for="apk-file-input"')
  })

  it('renders an aria-live region for status messages', () => {
    const html = renderToStaticMarkup(React.createElement(ApkUploader))
    expect(html).toContain('aria-live="polite"')
  })

  it('does NOT render the upload <button> when no file is selected (initial state)', () => {
    const html = renderToStaticMarkup(React.createElement(ApkUploader))
    // The upload action button is only rendered when a file is chosen.
    // In static markup there is no file selection, so no <button> should appear.
    expect(html).not.toContain('<button')
  })

  it('renders the "Upload APK" section heading', () => {
    const html = renderToStaticMarkup(React.createElement(ApkUploader))
    // The uppercase label in the card header
    expect(html).toContain('Upload APK')
  })
})
