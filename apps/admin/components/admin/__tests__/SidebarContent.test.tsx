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
import type { NavBadges } from '@/lib/admin/navBadges'

type Props = React.ComponentProps<typeof SidebarContent>
const render = (props: Partial<Props> = {}) =>
  renderToStaticMarkup(React.createElement(SidebarContent, { userEmail: 'admin@test.com', ...props }))

/** A promise React's `use()` reads synchronously, as it would after streaming. */
function settled(value: NavBadges): Promise<NavBadges> {
  return Object.assign(Promise.resolve(value), { status: 'fulfilled', value })
}

const NAV_LABELS = ['Home', 'Knowledge base', 'Drafts', 'Feedback', 'Data tables', 'User guide']

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

  it('marks the active item with more than colour: weight and a filled shape', () => {
    const active = render().match(/<a[^>]*aria-current="page"[^>]*>/)![0]
    expect(active).toMatch(/font-semibold/)
    expect(active).toMatch(/bg-sidebar-active/)
  })

  it('uses drawn icons, not emoji', () => {
    const html = render()
    expect(html).toContain('<svg')
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
  })

  it('has a labelled sign-out button', () => {
    expect(render()).toMatch(/<button[^>]*type="button"[^>]*>[\s\S]*?Sign out/)
  })

  it('uses sidebar tokens, not white alphas', () => {
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

  it('drops the decorative brand dot', () => {
    expect(render()).not.toMatch(/rounded-full bg-maroon-light/)
  })

  describe('scrollbar and tooltips (the owner\'s report)', () => {
    it('never uses a native title tooltip, expanded or collapsed', () => {
      expect(render()).not.toMatch(/\stitle="/)
      expect(render({ collapsed: true, onToggleCollapsed: () => {} })).not.toMatch(/\stitle="/)
      expect(render({ onClose: () => {} })).not.toMatch(/\stitle="/)
    })

    it('scrolls the nav through the auto-hiding .sidebar-scroll container', () => {
      expect(render()).toMatch(/<nav[^>]*class="[^"]*sidebar-scroll/)
    })

    it('has no rail tooltips while expanded: the labels are visible', () => {
      const html = render({ onToggleCollapsed: () => {} })
      expect(html).not.toContain('data-rail-tip')
      for (const label of NAV_LABELS) expect(html).not.toContain(`<span class="sr-only">${label}</span>`)
    })

    it('gives every rail item a tooltip and keeps its name for screen readers', () => {
      const html = render({ collapsed: true, onToggleCollapsed: () => {} })
      for (const label of NAV_LABELS) {
        expect(html).toContain(`data-rail-tip="${label}"`)
        expect(html).toContain(`<span class="sr-only">${label}</span>`)
      }
    })

    it('keeps aria-current and the group headings in rail mode', () => {
      pathname = '/admin/feedback'
      const html = render({ collapsed: true, onToggleCollapsed: () => {} })
      expect((html.match(/aria-current="page"/g) ?? []).length).toBe(1)
      expect(html).toMatch(/<a[^>]*href="\/admin\/feedback"[^>]*aria-current="page"/)
      expect(html).toMatch(/<h2[^>]*class="sr-only"[^>]*>Inbox<\/h2>/)
      pathname = '/admin/flashcards'
    })

    it('rails the footer too: sign out and the account get tooltips', () => {
      const html = render({ collapsed: true, onToggleCollapsed: () => {} })
      expect(html).toContain('data-rail-tip="Sign out"')
      expect(html).toContain('data-rail-tip="admin@test.com"')
    })
  })

  describe('collapse control', () => {
    it('is absent without a toggle handler (the mobile drawer)', () => {
      expect(render()).not.toMatch(/Collapse sidebar|Expand sidebar/)
    })

    it('is a toggle button: one stable name, pressed while the rail is on', () => {
      const open = render({ onToggleCollapsed: () => {} }).match(/<button[^>]*aria-label="Collapse sidebar"[^>]*>/)?.[0]
      const rail = render({ collapsed: true, onToggleCollapsed: () => {} }).match(/<button[^>]*aria-label="Collapse sidebar"[^>]*>/)?.[0]
      expect(open).toContain('aria-pressed="false"')
      expect(rail).toContain('aria-pressed="true"')
      // The content never hides, so this is not a disclosure.
      expect(open).not.toContain('aria-expanded')
      expect(rail).not.toContain('aria-expanded')
      expect(open).toContain('aria-controls="admin-sidebar"')
      expect(open).toContain('aria-keyshortcuts="Control+B Meta+B"')
    })

    it('shows the shortcut as visible hint text while expanded', () => {
      const html = render({ onToggleCollapsed: () => {} })
      expect(html).toMatch(/<kbd[^>]*>Ctrl<\/kbd>[\s\S]*?<kbd[^>]*>B<\/kbd>/)
    })

    it('carries the shortcut hint in its rail tooltip, matching its name', () => {
      const btn = render({ collapsed: true, onToggleCollapsed: () => {} }).match(/<button[^>]*aria-label="Collapse sidebar"[^>]*>/)?.[0]
      expect(btn).toContain('data-rail-tip="Collapse sidebar"')
      expect(btn).toContain('data-rail-hint="Ctrl B"')
    })

    it('offers a named close button in the drawer', () => {
      expect(render({ onClose: () => {} })).toMatch(/<button[^>]*aria-label="Close navigation"/)
    })
  })

  describe('queue badges', () => {
    const badges = settled({ '/admin/feedback': 12, '/admin/reports': 0, '/admin/flashcards/drafts': 140 })

    it('shows open counts next to their item, with words for screen readers', () => {
      const html = render({ badges })
      expect(html).toMatch(/Feedback[\s\S]*?>12<[\s\S]*?12 waiting/)
      expect(html).toMatch(/Drafts[\s\S]*?>99\+<[\s\S]*?140 waiting/)
    })

    it('shows nothing for an empty queue', () => {
      const html = render({ badges })
      expect(html).not.toMatch(/Reported questions[^<]*<\/span>\s*<span[^>]*>0</)
      expect(html).not.toMatch(/\b0 waiting/)
    })

    it('shrinks to a marker in rail mode but keeps the count in the name and tooltip', () => {
      const html = render({ badges, collapsed: true, onToggleCollapsed: () => {} })
      expect(html).toContain('data-rail-tip="Feedback"')
      expect(html).toContain('data-rail-hint="12 waiting"')
      expect(html).toContain('12 waiting')
    })

    it('keeps the last known counts on screen while fresh ones load (no flash on refresh)', () => {
      const pending = new Promise<NavBadges>(() => {})
      const html = render({ badges: pending, lastBadges: { '/admin/feedback': 5 } })
      expect(html).toMatch(/Feedback[\s\S]*?>5<[\s\S]*?5 waiting/)
    })

    it('renders without badges while counts are still loading', () => {
      const pending = new Promise<NavBadges>(() => {})
      expect(() => render({ badges: pending })).not.toThrow()
    })
  })
})
