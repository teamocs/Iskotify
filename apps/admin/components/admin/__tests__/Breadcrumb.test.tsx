import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement('a', { href, className }, children),
}))

import { Breadcrumb } from '../Breadcrumb'

const trail = (items: { label: string; href?: string }[]) => renderToStaticMarkup(React.createElement(Breadcrumb, { items }))

describe('Breadcrumb', () => {
  it('renders all item labels', () => {
    const html = trail([
      { label: 'Subjects', href: '/admin/flashcards' },
      { label: 'Math', href: '/admin/flashcards/subjects/abc' },
      { label: 'Algebra' },
    ])
    expect(html).toContain('Subjects')
    expect(html).toContain('Math')
    expect(html).toContain('Algebra')
  })

  it('renders a link for non-last items that have href', () => {
    expect(trail([{ label: 'Subjects', href: '/admin/flashcards' }, { label: 'Algebra' }])).toContain('href="/admin/flashcards"')
  })

  it('does not render last item as a link', () => {
    expect(trail([{ label: 'Subjects', href: '/admin/flashcards' }, { label: 'LastItem' }])).not.toContain('>LastItem</a>')
  })

  it('is a labelled breadcrumb landmark with an ordered list', () => {
    const html = trail([{ label: 'A', href: '/a' }, { label: 'B' }])
    expect(html).toMatch(/<nav[^>]*aria-label="Breadcrumb"/)
    expect(html).toMatch(/<ol[\s\S]*<li/)
  })

  it('marks the current page', () => {
    expect(trail([{ label: 'A', href: '/a' }, { label: 'B' }])).toMatch(/aria-current="page"[^>]*>B</)
  })

  it('draws the separator as a hidden icon, not a Unicode glyph', () => {
    const html = trail([{ label: 'A', href: '/a' }, { label: 'B' }])
    expect(html).not.toContain('›')
    expect((html.match(/<svg[^>]*aria-hidden="true"/g) ?? []).length).toBe(1)
  })
})
