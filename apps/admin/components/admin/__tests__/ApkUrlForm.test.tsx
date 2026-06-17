import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// Mock next/navigation (used by ApkUrlForm for router.refresh)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

import { ApkUrlForm } from '../ApkUrlForm'

describe('ApkUrlForm', () => {
  it('renders a URL input', () => {
    const html = renderToStaticMarkup(React.createElement(ApkUrlForm, { currentUrl: '' }))
    expect(html).toContain('type="url"')
    expect(html).toContain('apk-url-input')
  })

  it('is prefilled with currentUrl', () => {
    const url = 'https://github.com/example/releases/download/v1/iskotify.apk'
    const html = renderToStaticMarkup(React.createElement(ApkUrlForm, { currentUrl: url }))
    expect(html).toContain(url)
  })

  it('renders the "Save link" button', () => {
    const html = renderToStaticMarkup(React.createElement(ApkUrlForm, { currentUrl: '' }))
    expect(html).toContain('Save link')
    expect(html).toContain('<button')
  })

  it('renders an accessible label linked to the input via htmlFor', () => {
    const html = renderToStaticMarkup(React.createElement(ApkUrlForm, { currentUrl: '' }))
    expect(html).toContain('for="apk-url-input"')
    expect(html).toContain('id="apk-url-input"')
  })

  it('renders an aria-live region for status messages', () => {
    const html = renderToStaticMarkup(React.createElement(ApkUrlForm, { currentUrl: '' }))
    expect(html).toContain('aria-live="polite"')
  })

  it('renders the github placeholder hint text', () => {
    const html = renderToStaticMarkup(React.createElement(ApkUrlForm, { currentUrl: '' }))
    expect(html).toContain('github.com')
  })

  it('does not render an error or success message on initial render', () => {
    const html = renderToStaticMarkup(React.createElement(ApkUrlForm, { currentUrl: '' }))
    expect(html).not.toContain('role="alert"')
    expect(html).not.toContain('bg-red-50')
    expect(html).not.toContain('bg-green-50')
  })
})
