import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/admin/Topbar', () => ({
  Topbar: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

let search = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/early-access',
  useSearchParams: () => new URLSearchParams(search),
}))

let regResult: { data: unknown[] | null; error: { message: string } | null }
const config: Record<string, string> = {}

vi.mock('@iskotify/utils', () => ({
  createServerClient: () => ({
    from: (table: string) => ({
      select: () => {
        if (table === 'early_access_registrations') return { order: () => Promise.resolve(regResult) }
        return {
          eq: (_c: string, key: string) => ({
            maybeSingle: () => Promise.resolve({ data: key in config ? { value: config[key] } : null, error: null }),
          }),
        }
      },
    }),
  }),
}))

const rows = [
  { id: 'r1', full_name: 'Ana Cruz', email: 'ana@example.com', school: 'Naga HS', grade_level: 'Grade 12', platform: 'android', status: 'pending', created_at: '2026-05-01T00:00:00Z' },
  { id: 'r2', full_name: null, email: 'ben@example.com', school: null, grade_level: null, platform: 'ios', status: 'sent', created_at: '2026-05-02T00:00:00Z' },
]

async function render(q = '') {
  search = q
  const { default: Page } = await import('../page')
  return renderToStaticMarkup((await Page()) as React.ReactElement)
}

describe('EarlyAccessPage', () => {
  beforeEach(() => {
    regResult = { data: rows, error: null }
    for (const k of Object.keys(config)) delete config[k]
  })

  it('has one h1 and no repeated page-title heading', async () => {
    const html = await render()
    expect((html.match(/<h1/g) ?? []).length).toBe(1)
    expect(html).not.toContain('Early-access registrations</h2>')
  })

  it('lists registrations in a table with human labels', async () => {
    const html = await render()
    expect(html).toContain('<caption')
    for (const h of ['Email', 'Name', 'School', 'Grade level', 'Status', 'Registered']) {
      expect(html).toContain(`>${h}<`)
    }
    expect(html).toContain('ana@example.com')
    expect(html).toContain('Send APK to ana@example.com')
    expect(html).toContain('Resend APK to ben@example.com')
  })

  it('filters registrations by status from the URL', async () => {
    const html = await render('status=sent')
    expect(html).toContain('ben@example.com')
    expect(html).not.toContain('ana@example.com')
  })

  it('groups the APK settings into labelled sections with real forms', async () => {
    const html = await render()
    expect(html).toContain('Early-access APK link</h2>')
    expect(html).toContain('App update for existing users</h2>')
    expect((html.match(/<form/g) ?? []).length).toBe(3)
  })

  it('states when no APK link is set, with an icon rather than a glyph character', async () => {
    const html = await render()
    expect(html).toContain('No APK link set yet')
    expect(html).not.toContain('&#9888;')
    expect(html).not.toContain('⚠')
  })

  it('shows an error banner instead of an empty table when registrations fail to load', async () => {
    regResult = { data: null, error: { message: 'relation does not exist' } }
    const html = await render()
    expect(html).toContain('role="alert"')
    expect(html).toContain('relation does not exist')
    expect(html).not.toContain('<caption')
  })
})
