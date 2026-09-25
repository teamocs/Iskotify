import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/admin/Topbar', () => ({
  Topbar: ({ title }: { title: string }) => <div data-testid="topbar">{title}</div>,
}))
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({
    from: () => ({ select: () => ({ order: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }),
  }),
}))

import CourseTagsPage from '../page'
const h2s = (html: string) => [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map(m => (m[1] ?? '').replace(/<[^>]+>/g, ''))

describe('CourseTagsPage', () => {
  it('renders no h1 in the body and no h2 repeating the title', () => {
    const html = renderToStaticMarkup(<CourseTagsPage />)
    expect(html).not.toContain('<h1')
    expect(h2s(html).some(t => /course.*tags/i.test(t))).toBe(false)
  })

  it('exposes the type filter as pressed-state toggle buttons', () => {
    const html = renderToStaticMarkup(<CourseTagsPage />)
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>All<\/button>/)
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Exams<\/button>/)
  })

  it('announces loading', () => {
    expect(renderToStaticMarkup(<CourseTagsPage />)).toMatch(/role="status"[^>]*>[^<]*Loading/)
  })
})
