import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

import { ConfirmDialog } from '../ConfirmDialog'

describe('ConfirmDialog', () => {
  it('renders an alertdialog with aria-modal, and labelledby/describedby pointing at real ids', () => {
    const html = renderToStaticMarkup(
      React.createElement(ConfirmDialog, { message: 'Delete this row?', onConfirm: vi.fn(), onCancel: vi.fn() })
    )
    expect(html).toContain('role="alertdialog"')
    expect(html).toContain('aria-modal="true"')

    const labelledbyMatch = html.match(/aria-labelledby="([^"]+)"/)
    const describedbyMatch = html.match(/aria-describedby="([^"]+)"/)
    expect(labelledbyMatch).not.toBeNull()
    expect(describedbyMatch).not.toBeNull()
    expect(html).toContain(`id="${labelledbyMatch![1]}"`)
    expect(html).toContain(`id="${describedbyMatch![1]}"`)
  })

  it('defaults to the "Delete" label and danger tone', () => {
    const html = renderToStaticMarkup(
      React.createElement(ConfirmDialog, { message: 'Delete this row?', onConfirm: vi.fn(), onCancel: vi.fn() })
    )
    expect(html).toContain('>Delete<')
    expect(html).toContain('bg-danger')
  })

  it('renders a custom confirmLabel when provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(ConfirmDialog, {
        message: 'Discard unsaved changes?',
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
        confirmLabel: 'Discard',
      })
    )
    expect(html).toContain('>Discard<')
    expect(html).not.toContain('>Delete<')
  })

  it('renders the default tone (non-danger) without a danger background when tone is "default"', () => {
    const html = renderToStaticMarkup(
      React.createElement(ConfirmDialog, {
        message: 'Proceed with this action?',
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
        confirmLabel: 'Proceed',
        tone: 'default',
      })
    )
    expect(html).not.toContain('bg-danger')
    expect(html).toContain('bg-maroon')
  })
})
