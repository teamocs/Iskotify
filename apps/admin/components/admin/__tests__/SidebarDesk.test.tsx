import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/upcat/review-queue', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@supabase/ssr', () => ({ createBrowserClient: () => ({ auth: { signOut: vi.fn() } }) }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('a', { href, ...rest }, children),
}))

import { SidebarContent } from '../SidebarContent'
import type { NavBadges } from '@/lib/admin/navBadges'

const settled = (value: NavBadges): Promise<NavBadges> => Object.assign(Promise.resolve(value), { status: 'fulfilled', value })
const html = renderToStaticMarkup(
  <SidebarContent userEmail="a@b.c" badges={settled({ '/admin/upcat/review-queue': 9, '/admin/feedback': 4 })} />,
)
const link = (href: string) => html.match(new RegExp(`<a href="${href}"[\\s\\S]*?</a>`))![0]

describe('Sidebar (macOS desk)', () => {
  it('uses 32px rows with 8px rounded hover and active states', () => {
    const row = link('/admin/feedback')
    expect(row).toMatch(/class="[^"]*\bh-8\b[^"]*\brounded-chip\b/)
    expect(row).toContain('hover:bg-sidebar-hover')
  })

  it('marks the active row with the maroon tint, a maroon icon and semibold text', () => {
    const row = link('/admin/upcat/review-queue')
    expect(row).toContain('aria-current="page"')
    expect(row).toMatch(/bg-sidebar-active[^"]*font-semibold/)
    expect(row).toMatch(/<svg[^>]*text-maroon/)
  })

  it('gives the review queue count the maroon pill, in tabular figures', () => {
    expect(link('/admin/upcat/review-queue')).toMatch(/<span aria-hidden="true" class="[^"]*bg-maroon\b[^"]*text-ink-inverse[^"]*tabular-nums[^"]*">9</)
  })

  it('keeps other queue counts neutral', () => {
    const row = link('/admin/feedback')
    expect(row).toMatch(/bg-neutral-soft[^"]*tabular-nums[^"]*">4</)
    expect(row).not.toMatch(/bg-maroon\b/)
  })
})
