import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Payment routes have no admin session: checkout is called by a signed-in
// STUDENT (bearer token, verified in the route) and the webhooks by PayMongo and
// RevenueCat (signature / shared secret, verified in the route). All three are
// exempt by EXACT path only.
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}))

import { middleware } from '../../../../middleware'

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
})

const call = (path: string, method = 'POST') =>
  middleware(new NextRequest(`https://iskotify.vercel.app${path}`, { method }))

describe('middleware and /api/payments/*', () => {
  for (const path of ['/api/payments/checkout', '/api/payments/paymongo/webhook', '/api/payments/revenuecat/webhook']) {
    it(`lets ${path} through without an admin session`, async () => {
      const res = await call(path)
      expect(res.headers.get('location')).toBeNull()
      expect(res.status).toBe(200)
    })
  }

  it('lets the checkout CORS preflight through', async () => {
    const res = await call('/api/payments/checkout', 'OPTIONS')
    expect(res.headers.get('location')).toBeNull()
  })

  it('matches exactly: look-alike and sub paths stay gated', async () => {
    for (const path of [
      '/api/payments',
      '/api/payments/checkout-admin',
      '/api/payments/paymongo/webhook/replay',
      '/api/payments/paymongo/webhooks',
      '/api/payments/revenuecat/webhook-x',
      '/api/payments/refund',
    ]) {
      const res = await call(path)
      expect(res.headers.get('location'), path).toMatch(/\/login$/)
    }
  })
})
