import { describe, it, expect } from 'vitest'
import config from '../next.config.mjs'

const nextConfig = config as any

describe('next.config security headers', () => {
  it('sets anti-framing and anti-sniffing headers on every route', async () => {
    const rules = await nextConfig.headers()
    const all = rules.find((r: { source: string }) => r.source === '/:path*')
    const h = Object.fromEntries(all.headers.map((x: { key: string; value: string }) => [x.key, x.value]))
    expect(h['X-Frame-Options']).toBe('DENY')
    expect(h['Content-Security-Policy']).toBe("frame-ancestors 'none'")
    expect(h['X-Content-Type-Options']).toBe('nosniff')
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
  })
})
