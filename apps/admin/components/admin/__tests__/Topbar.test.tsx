import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/app/admin/actions', () => ({ triggerSync: vi.fn() }))

import { Topbar } from '../Topbar'

describe('Topbar', () => {
  it('renders the page title as the single h1', () => {
    const html = renderToStaticMarkup(<Topbar title="All listings" />)
    expect((html.match(/<h1/g) ?? []).length).toBe(1)
    expect(html).toMatch(/<h1[^>]*>All listings<\/h1>/)
  })

  it('has a named menu button and a named shortcuts button', () => {
    const html = renderToStaticMarkup(<Topbar title="T" />)
    expect(html).toContain('aria-label="Open navigation"')
    expect(html).toContain('aria-label="Keyboard shortcuts"')
  })

  it('renders page actions when given', () => {
    const html = renderToStaticMarkup(<Topbar title="T" actions={<button type="button">Do it</button>} />)
    expect(html).toContain('Do it')
  })

  it('drops the emoji from export and sync controls', () => {
    const html = renderToStaticMarkup(<Topbar title="T" showSyncButton exportHref="/api/x" />)
    expect(html).toContain('Sync now')
    expect(html).toContain('href="/api/x?format=csv"')
    expect(html).not.toMatch(/[⬇🔄⏳☰]/u)
  })

  it('is solid, not frosted glass, and uses tokens', () => {
    const html = renderToStaticMarkup(<Topbar title="T" />)
    expect(html).not.toContain('backdrop-blur')
    expect(html).not.toMatch(/(?:bg|border)-\[|border-black\/|bg-white\//)
  })
})
