import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServerClient } from '@iskotify/utils'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { syncDriveFolder } from '@/lib/kb/syncDriveFolder'
import { createDriveGateway, createMediaStore } from '@/lib/kb/driveClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Vercel cap — see TIME_BUDGET_MS

// Stop starting new files after this, leaving headroom for the file in flight.
// Anything left is picked up by the next run (the ledger makes it resumable).
const TIME_BUDGET_MS = 45_000

// Vercel Cron calls GET with `Authorization: Bearer $CRON_SECRET`. This path is
// exempt from the session middleware, so it must authenticate itself: either
// that secret or an admin session (the "Sync now" button).
function isCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const got = Buffer.from(req.headers.get('authorization') ?? '')
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && timingSafeEqual(got, want)
}

async function run(req: NextRequest) {
  let db: ReturnType<typeof createServerClient>
  if (isCron(req)) {
    db = createServerClient()
  } else {
    const gate = await requireAdmin()
    if ('error' in gate && gate.error) return gate.error
    db = gate.supabase!
  }

  const rootId = process.env.KB_DRIVE_FOLDER_ID
  if (!rootId) {
    return NextResponse.json({ error: 'KB_DRIVE_FOLDER_ID is not configured' }, { status: 500 })
  }

  try {
    const summary = await syncDriveFolder(db, createDriveGateway(), createMediaStore(db), {
      rootId,
      deadline: Date.now() + TIME_BUDGET_MS,
    })
    return NextResponse.json(summary)
  } catch (err) {
    console.error('[kb/drive-sync] failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Drive sync failed' }, { status: 500 })
  }
}

export const GET = run
export const POST = run
