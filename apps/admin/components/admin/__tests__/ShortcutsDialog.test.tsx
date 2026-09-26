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

  it('joins chord keys with "+", not "then"', () => {
    const html = renderToStaticMarkup(<ShortcutsDialog open onClose={() => {}} />)
    expect(html).toContain('Collapse or expand the sidebar')
    expect(html).toMatch(/<kbd[^>]*>Ctrl<\/kbd>[\s\S]{0,120}?\+[\s\S]{0,120}?<kbd[^>]*>B<\/kbd>/)
    expect(html).not.toMatch(/<kbd[^>]*>Ctrl<\/kbd>[\s\S]{0,120}?then/)
  })

  it('renders nothing while closed', () => {
    expect(renderToStaticMarkup(<ShortcutsDialog open={false} onClose={() => {}} />)).toBe('')
  })
})
