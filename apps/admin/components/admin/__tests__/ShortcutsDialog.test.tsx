import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import { ShortcutsDialog } from '../ShortcutsDialog'

describe('ShortcutsDialog', () => {
  it('lists every shortcut with its keys in <kbd>', () => {
    const html = renderToStaticMarkup(<ShortcutsDialog open onClose={() => {}} />)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('Keyboard shortcuts')
    for (const k of ['g', 'h', 'c', 'i', '/', '?']) expect(html).toContain(`<kbd`)
    expect(html).toContain('Go to Home')
    expect(html).toContain('Go to Content')
    expect(html).toContain('Go to Inbox')
    expect(html).toContain('Focus search')
    expect(html).toMatch(/<dl/)
  })

  it('renders nothing while closed', () => {
    expect(renderToStaticMarkup(<ShortcutsDialog open={false} onClose={() => {}} />)).toBe('')
  })
})
