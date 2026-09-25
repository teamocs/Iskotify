import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

let pathname = '/admin/flashcards'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ auth: { signOut: vi.fn() } }),
}))
// Pass every prop through so aria-current and friends reach the markup.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('a', { href, ...rest }, children),
}))

import { SidebarContent } from '../SidebarContent'

const render = () => renderToStaticMarkup(React.createElement(SidebarContent, { userEmail: 'admin@test.com' }))

describe('SidebarContent', () => {
  it('groups navigation into the five jobs, as real headings', () => {
    const html = render()
    for (const g of ['Content', 'Listings', 'Inbox', 'Audience', 'System']) {
      expect(html).toMatch(new RegExp(`<h2[^>]*>${g}</h2>`))
    }
  })

  it('is a labelled navigation landmark', () => {
    expect(render()).toMatch(/<nav[^>]*aria-label="Admin"/)
  })

  it('names the knowledge base consistently', () => {
    expect(render()).toContain('Knowledge base')
  })

  it('links the data tables index instead of 19 raw tables', () => {
    const html = render()
    expect(html).toContain('href="/admin/data"')
    expect(html).not.toMatch(/href="\/admin\/data\/[a-z_]+"/)
  })

  it('marks the active route with aria-current="page"', () => {
    pathname = '/admin/flashcards'
    const html = render()
    expect(html).toMatch(/<a[^>]*href="\/admin\/flashcards"[^>]*aria-current="page"|<a[^>]*aria-current="page"[^>]*href="\/admin\/flashcards"/)
    expect((html.match(/aria-current="page"/g) ?? []).length).toBe(1)
  })

  it('keeps the parent item active on nested pages', () => {
    pathname = '/admin/flashcards/subjects/abc'
    const html = render()
    expect(html).toMatch(/aria-current="page"[^>]*>[\s\S]*?Knowledge base|href="\/admin\/flashcards"[^>]*aria-current="page"/)
    pathname = '/admin/flashcards'
  })

  it('uses drawn icons, not emoji', () => {
    const html = render()
    expect(html).toContain('<svg')
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
  })

  it('has a labelled sign-out button', () => {
    expect(render()).toMatch(/<button[^>]*type="button"[^>]*>[\s\S]*?Sign out/)
  })

  it('uses sidebar ink tokens, not white alphas', () => {
    const html = render()
    expect(html).not.toMatch(/text-white\/\d+/)
    expect(html).toContain('text-sidebar-ink')
  })

  it('keeps text at or above the 12px floor', () => {
    expect(render()).not.toMatch(/text-\[(?:9|10|11)px\]/)
  })

  it('renders the user email and the brand', () => {
    const html = render()
    expect(html).toContain('admin@test.com')
    expect(html).toContain('Iskotify')
    expect(html).toContain('Admin')
  })
})
