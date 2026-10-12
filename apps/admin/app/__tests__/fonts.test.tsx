import React from 'react'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@supabase/ssr', () => ({ createBrowserClient: () => ({ auth: { signOut: vi.fn(), signInWithPassword: vi.fn() } }) }))
vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => React.createElement('img', { alt: '', ...p }) }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('a', { href, ...rest }, children),
}))

import { AdminShell } from '@/components/admin/AdminShell'
import { Dialog } from '@/components/ui/Dialog'
import { Drawer } from '@/components/ui/Drawer'
import LoginPage from '../login/page'
import { Nav } from '@/components/landing/Nav'
import { Hero } from '@/components/landing/Hero'

/*
 * P5 font scope: the landing page keeps Outfit/Lexend (owner, 2026-10-12) while
 * the admin console draws in the system font. The root layout keeps loading
 * both faces through next/font; only the admin scope re-points the variables.
 */

const ROOT = path.resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const preset = require('@iskotify/ui/tailwind-preset') as { theme: { extend: { fontFamily: Record<string, string[]> } } }

const SYSTEM_STACK = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, system-ui, sans-serif'

function scopeBlock(): string {
  const css = read('app/globals.css')
  const m = css.match(/\.admin-type\s*\{([^}]*)\}/)
  expect(m, '.admin-type is defined in globals.css').toBeTruthy()
  return m![1]!
}

describe('landing keeps Outfit and Lexend', () => {
  it('the root layout still loads both faces into the --font-heading / --font-body variables', () => {
    const layout = read('app/layout.tsx')
    expect(layout).toMatch(/import\s*\{\s*Outfit,\s*Lexend\s*\}\s*from\s*["']next\/font\/google["']/)
    expect(layout).toMatch(/Outfit\(\{[\s\S]*?variable:\s*["']--font-heading["']/)
    expect(layout).toMatch(/Lexend\(\{[\s\S]*?variable:\s*["']--font-body["']/)
    expect(layout).toMatch(/className=\{`\$\{outfit\.variable\} \$\{lexend\.variable\}`\}/)
  })

  it('the preset still reads those variables, with the faces as named fallbacks (not remapped globally)', () => {
    const { heading, body } = preset.theme.extend.fontFamily
    expect(heading![0]).toBe('var(--font-heading)')
    expect(heading).toContain('Outfit')
    expect(body![0]).toBe('var(--font-body)')
    expect(body).toContain('Lexend')
  })

  it('no landing component opts into the admin system-font scope', () => {
    const dir = path.join(ROOT, 'components/landing')
    for (const f of readdirSync(dir).filter(n => /\.tsx?$/.test(n))) {
      expect(readFileSync(path.join(dir, f), 'utf8'), f).not.toContain('admin-type')
    }
    expect(read('app/page.tsx')).not.toContain('admin-type')
    expect(renderToStaticMarkup(<Nav />)).not.toContain('admin-type')
    expect(renderToStaticMarkup(<Hero />)).not.toContain('admin-type')
  })
})

describe('the admin console uses the system font', () => {
  it('the scope overrides both variables to the system stack', () => {
    const block = scopeBlock()
    expect(block).toContain(`--font-heading: ${SYSTEM_STACK};`)
    expect(block).toContain(`--font-body: ${SYSTEM_STACK};`)
    expect(block).toMatch(/font-family:\s*var\(--font-body\)/)
    expect(block).not.toMatch(/Outfit|Lexend/)
  })

  it('AdminShell wraps the whole console (sidebar, page, toaster) in the scope', () => {
    const html = renderToStaticMarkup(<AdminShell userEmail="a@b.c"><p>page</p></AdminShell>)
    expect(html.startsWith('<div class="admin-type')).toBe(true)
  })

  it('the admin login is in the scope', () => {
    // React may hoist an image preload <link> ahead of the page's root element.
    expect(renderToStaticMarkup(<LoginPage />).replace(/^(<link[^>]*>)+/, '')).toMatch(/^<div class="admin-type /)
  })

  it('the admin 403 screen is in the scope', () => {
    expect(read('app/admin/layout.tsx')).toMatch(/className="admin-type [^"]*"[\s\S]*?403/)
  })

  it('Dialog and Drawer carry the scope, since they portal outside the shell onto <body>', () => {
    const noop = () => {}
    expect(renderToStaticMarkup(<Dialog open onClose={noop} title="T">b</Dialog>)).toMatch(/^<div class="admin-type /)
    expect(renderToStaticMarkup(<Drawer open onClose={noop} title="T">b</Drawer>)).toMatch(/^<div class="admin-type /)
  })
})
