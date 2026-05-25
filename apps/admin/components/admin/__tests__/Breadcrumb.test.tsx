import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement('a', { href, className }, children),
}))

import { Breadcrumb } from '../Breadcrumb'

describe('Breadcrumb', () => {
  it('renders all item labels', () => {
    const html = renderToStaticMarkup(
      React.createElement(Breadcrumb, {
        items: [
          { label: 'Subjects', href: '/admin/flashcards' },
          { label: 'Math', href: '/admin/flashcards/subjects/abc' },
          { label: 'Algebra' },
        ],
      })
    )
    expect(html).toContain('Subjects')
    expect(html).toContain('Math')
    expect(html).toContain('Algebra')
  })

  it('renders a link for non-last items that have href', () => {
    const html = renderToStaticMarkup(
      React.createElement(Breadcrumb, {
        items: [{ label: 'Subjects', href: '/admin/flashcards' }, { label: 'Algebra' }],
      })
    )
    expect(html).toContain('href="/admin/flashcards"')
  })

  it('does not render last item as a link', () => {
    const html = renderToStaticMarkup(
      React.createElement(Breadcrumb, {
        items: [{ label: 'Subjects', href: '/admin/flashcards' }, { label: 'LastItem' }],
      })
    )
    expect(html).not.toContain('>LastItem</a>')
  })

  it('renders separator between items', () => {
    const html = renderToStaticMarkup(
      React.createElement(Breadcrumb, {
        items: [{ label: 'A', href: '/a' }, { label: 'B' }],
      })
    )
    expect(html).toContain('›')
  })
})
