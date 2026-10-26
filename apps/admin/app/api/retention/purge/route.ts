import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { isCron } from '@/lib/cron/isCron'
import { purgeExpired } from '@/lib/retention/purge'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Daily Vercel Cron (apps/admin/vercel.json). Cron secret only: there is no
// button for this, and the path is exempt from the session middleware.
export async function GET(req: NextRequest) {
  if (!isCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await purgeExpired(createServerClient(), new Date()))
  } catch (err) {
    console.error('[retention/purge] failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Purge failed' }, { status: 500 })
  }
}
