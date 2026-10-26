import { timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'

// Vercel Cron calls with `Authorization: Bearer $CRON_SECRET`. Cron paths are
// exempt from the session middleware, so each one must check this itself.
export function isCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const got = Buffer.from(req.headers.get('authorization') ?? '')
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && timingSafeEqual(got, want)
}
