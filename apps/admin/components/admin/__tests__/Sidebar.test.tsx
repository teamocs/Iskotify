import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ usePathname: () => '/admin', useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@supabase/ssr', () => ({ createBrowserClient: () => ({ auth: { signOut: vi.fn() } }) }))

import { Sidebar } from '../Sidebar'

const render = (collapsed: boolean) =>
  renderToStaticMarkup(<Sidebar userEmail="a@b.c" collapsed={collapsed} onToggleCollapsed={() => {}} />)

describe('Sidebar (desktop)', () => {
  it('is the element the collapse button controls', () => {
    expect(render(false)).toMatch(/^<div[^>]*id="admin-sidebar"/)
  })

  it('exposes its state for styling and tests', () => {
    expect(render(false)).toMatch(/^<div[^>]*data-state="expanded"/)
    expect(render(true)).toMatch(/^<div[^>]*data-state="collapsed"/)
  })

  it('narrows to an icon rail when collapsed', () => {
    const open = render(false).match(/^<div[^>]*>/)![0]
    const rail = render(true).match(/^<div[^>]*>/)![0]
    expect(open).toContain('w-[232px]')
    expect(rail).toContain('w-14')
  })

  it('animates the width only when motion is allowed', () => {
    expect(render(false).match(/^<div[^>]*>/)![0]).toMatch(/motion-reduce:transition-none/)
  })

  it('is hidden below md, where the drawer takes over', () => {
    expect(render(false).match(/^<div[^>]*>/)![0]).toMatch(/hidden md:flex/)
  })
})
