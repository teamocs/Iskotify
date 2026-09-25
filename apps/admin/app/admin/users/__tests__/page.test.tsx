import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/admin/Topbar', () => ({
  Topbar: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

let search = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/users',
  useSearchParams: () => new URLSearchParams(search),
}))

let authResult: { data: { users: unknown[] } | null; error: { message: string } | null }
let profilesResult: { data: unknown[] | null; error: { message: string } | null }

vi.mock('@iskotify/utils', () => ({
  createServerClient: () => ({
    from: (table: string) => ({
      select: () => Promise.resolve(
        table === 'profiles' ? profilesResult : { data: [{ user_id: 'u1' }], error: null },
      ),
    }),
    auth: { admin: { listUsers: () => Promise.resolve(authResult) } },
  }),
}))

const users = [
  { id: 'u1', email: 'ana@example.com', created_at: '2026-03-02T00:00:00Z', email_confirmed_at: '2026-03-02T00:00:00Z' },
  { id: 'u2', email: 'ben@example.com', created_at: '2026-04-10T00:00:00Z', email_confirmed_at: null },
  { id: 'a1', email: 'boss@example.com', created_at: '2026-01-01T00:00:00Z', email_confirmed_at: '2026-01-01T00:00:00Z' },
]

async function render(q = '') {
  search = q
  const { default: Page } = await import('../page')
  return renderToStaticMarkup((await Page()) as React.ReactElement)
}

describe('UsersPage', () => {
  beforeEach(() => {
    authResult = { data: { users }, error: null }
    profilesResult = { data: [{ id: 'u1', role: 'student' }, { id: 'u2', role: null }, { id: 'a1', role: 'admin' }], error: null }
  })

  it('has one h1 and human column labels in a table', async () => {
    const html = await render()
    expect((html.match(/<h1/g) ?? []).length).toBe(1)
    expect(html).not.toContain('Current users</h2>')
    for (const h of ['Email', 'Role', 'Email confirmed', 'Joined', 'App data']) {
      expect(html).toContain(`>${h}<`)
    }
    expect(html).toContain('<caption')
  })

  it('lists non-admin users and excludes admins', async () => {
    const html = await render()
    expect(html).toContain('ana@example.com')
    expect(html).toContain('ben@example.com')
    expect(html).not.toContain('boss@example.com')
  })

  it('filters by role and confirmation, and searches by email, from the URL', async () => {
    const html = await render()
    expect(html).toMatch(/<label[^>]*>Role</)
    expect(html).toMatch(/<label[^>]*>Confirmed</)
    const unconfirmed = await render('confirmed=no')
    expect(unconfirmed).toContain('ben@example.com')
    expect(unconfirmed).not.toContain('ana@example.com')
    const searched = await render('q=ana')
    expect(searched).toContain('ana@example.com')
    expect(searched).not.toContain('ben@example.com')
  })

  it('shows an error banner, not an empty table, when users fail to load', async () => {
    authResult = { data: null, error: { message: 'service role key missing' } }
    const html = await render()
    expect(html).toContain('role="alert"')
    expect(html).toContain('service role key missing')
    expect(html).not.toContain('<table')
  })

  it('shows an error banner when roles fail to load (admins could leak into the list)', async () => {
    profilesResult = { data: null, error: { message: 'profiles unavailable' } }
    const html = await render()
    expect(html).toContain('profiles unavailable')
    expect(html).not.toContain('boss@example.com')
  })
})
