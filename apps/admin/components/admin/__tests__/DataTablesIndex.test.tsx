import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

let search = ''
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => '/admin/data',
  useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('a', { href, ...rest }, children),
}))

import { DataTablesIndex } from '../DataTablesIndex'

const render = (q = '') => { search = q; return renderToStaticMarkup(<DataTablesIndex />) }

describe('DataTablesIndex', () => {
  it('lists all 19 tables with human labels, each linking to its browser', () => {
    const html = render()
    expect((html.match(/href="\/admin\/data\/[a-z_]+"/g) ?? []).length).toBe(19)
    expect(html).toContain('Tertiary schools')
    expect(html).toContain('UPCAT cutoffs')
  })

  it('never shows a snake_case name as a column label', () => {
    const html = render()
    const headers = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => m[1]!.replace(/<[^>]+>/g, ''))
    for (const h of headers) expect(h).not.toMatch(/_/)
  })

  it('filters by search from the URL', () => {
    const html = render('q=upcat')
    expect(html).toContain('UPCAT cutoffs')
    expect(html).not.toContain('Tertiary schools')
  })

  it('can be narrowed by group', () => {
    const html = render('group=careers')
    expect(html).toContain('Career courses')
    expect(html).not.toContain('UPCAT cutoffs')
  })
})
