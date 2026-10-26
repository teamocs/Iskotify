import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Operator endpoints skip the admin session gate because each route
// authenticates itself (x-admin-secret, CRON_SECRET, or is mobile-public).
// None of them has sub-routes, so the exemption must match the path EXACTLY:
// a look-alike or a nested path must still require a session.
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}))

import { middleware } from '../middleware'

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
})

const call = (path: string) => middleware(new NextRequest(`https://iskotify.vercel.app${path}`, { method: 'POST' }))

const OPERATOR_PATHS = [
  '/api/flashcards/backfill',
  '/api/flashcards/distractors',
  '/api/flashcards/sanitize-legacy',
  '/api/places/school-search',
  '/api/search/listings',
  '/api/kb/drive-sync',
  '/api/retention/purge',
]

describe('middleware operator endpoints', () => {
  it.each(OPERATOR_PATHS)('lets %s through without an admin session', async (p) => {
    const res = await call(p)
    expect(res.headers.get('location')).toBeNull()
    expect(res.status).toBe(200)
  })

  it('ignores the query string (the mobile school search sends one)', async () => {
    const res = await call('/api/places/school-search?q=up&lang=en&region=ph')
    expect(res.headers.get('location')).toBeNull()
  })

  it.each(OPERATOR_PATHS.flatMap(p => [p + '-x', p + 'x']))(
    'gates the look-alike %s',
    async (p) => {
      const res = await call(p)
      expect(res.headers.get('location')).toMatch(/\/login$/)
    },
  )

  it.each(OPERATOR_PATHS.map(p => p + '/x'))('gates the nested path %s (no sub-routes are intended)', async (p) => {
    const res = await call(p)
    expect(res.headers.get('location')).toMatch(/\/login$/)
  })

  it('still gates sibling admin routes such as /api/flashcards/regenerate-distractors', async () => {
    const res = await call('/api/flashcards/regenerate-distractors')
    expect(res.headers.get('location')).toMatch(/\/login$/)
  })
})
