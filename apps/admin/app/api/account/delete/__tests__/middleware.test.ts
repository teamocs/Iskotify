import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// A signed-in STUDENT has no admin session, so the middleware must let
// /api/account/delete through (the route verifies the bearer token itself),
// while everything else under /api still needs a session.
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}))

import { middleware } from '../../../../../middleware'

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
})

const call = (path: string) => middleware(new NextRequest(`https://iskotify.vercel.app${path}`, { method: 'POST' }))

describe('middleware and /api/account/delete', () => {
  it('lets the route through without an admin session (it authenticates by bearer token)', async () => {
    const res = await call('/api/account/delete')
    expect(res.headers.get('location')).toBeNull()
    expect(res.status).toBe(200)
  })

  it('lets the CORS preflight through too', async () => {
    const res = await middleware(new NextRequest('https://iskotify.vercel.app/api/account/delete', { method: 'OPTIONS' }))
    expect(res.headers.get('location')).toBeNull()
  })

  it('matches the path exactly: a look-alike route is not exempt', async () => {
    const res = await call('/api/account/delete-everything')
    expect(res.headers.get('location')).toMatch(/\/login$/)
  })

  it('still gates other admin API routes', async () => {
    const res = await call('/api/admin/app-reports')
    expect(res.headers.get('location')).toMatch(/\/login$/)
  })
})
