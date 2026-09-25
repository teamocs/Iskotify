import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/admin/Topbar', () => ({
  Topbar: ({ title }: { title: string }) => <div data-testid="topbar">{title}</div>,
}))

import GuidePage from '../page'
const h2s = (html: string) => [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map(m => (m[1] ?? '').replace(/<[^>]+>/g, ''))

describe('GuidePage', () => {
  it('renders no h1 in the body and no h2 repeating the title', () => {
    const html = renderToStaticMarkup(<GuidePage />)
    expect(html).not.toContain('<h1')
    expect(h2s(html).some(t => /guide/i.test(t))).toBe(false)
    expect(html).not.toContain('Admin Console Guide')
  })

  it('keeps each section as an h2 and the per-table anchors', () => {
    const html = renderToStaticMarkup(<GuidePage />)
    expect(h2s(html)).toEqual(expect.arrayContaining(['Import / export formats', 'Specialized editors', 'Courses &amp; Careers']))
    expect(html).toContain('id="career_courses"')
  })

  it('uses no uppercase micro table headers', () => {
    expect(renderToStaticMarkup(<GuidePage />)).not.toMatch(/text-\[1[01]px\]|uppercase/)
  })
})
