import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/flashcards',
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ auth: { signOut: vi.fn() } }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, className, onClick }: { href: string; children: React.ReactNode; className?: string; onClick?: () => void }) =>
    React.createElement('a', { href, className, onClick }, children),
}))

import { SidebarContent } from '../SidebarContent'

describe('SidebarContent', () => {
  it('renders all three nav sections', () => {
    const html = renderToStaticMarkup(
      React.createElement(SidebarContent, { userEmail: 'admin@test.com' })
    )
    expect(html).toContain('LISTINGS')
    expect(html).toContain('SYNC')
    expect(html).toContain('FLASHCARDS')
  })

  it('renders user email', () => {
    const html = renderToStaticMarkup(
      React.createElement(SidebarContent, { userEmail: 'admin@test.com' })
    )
    expect(html).toContain('admin@test.com')
  })

  it('highlights the active route with bg-white/10', () => {
    // pathname is '/admin/flashcards' (mocked above) → Subjects link is active
    const html = renderToStaticMarkup(
      React.createElement(SidebarContent, { userEmail: 'admin@test.com' })
    )
    expect(html).toContain('bg-white/10')
  })

  it('renders Iskotify brand', () => {
    const html = renderToStaticMarkup(
      React.createElement(SidebarContent, { userEmail: 'admin@test.com' })
    )
    expect(html).toContain('Iskotify')
    expect(html).toContain('Admin Console')
  })
})
