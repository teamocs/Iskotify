import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createServerClient } from '@iskotify/utils'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { createDriveGateway, createMediaStore } from '@/lib/kb/driveClient'
import type { DriveGateway } from '@/lib/kb/syncDriveFolder'
import { logSyncRun, type SyncTrigger } from '@/lib/kb/syncRuns'
import { loadSyncSources } from '@/lib/driveSources/sources'
import { syncQuestionSources } from '@/lib/driveSources/questions'
import { syncContentSources, type ContentSource, type ContentSyncSummary } from '@/lib/driveContent/syncContent'

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

// GET is the cron path only. An admin session is accepted on POST alone, so a
// link or <img> loaded in a signed-in admin's browser cannot trigger a sync.
async function run(req: NextRequest, allowSession: boolean) {
  let db: ReturnType<typeof createServerClient>
  const trigger: SyncTrigger = isCron(req) ? 'cron' : 'manual'
  if (trigger === 'cron') {
    db = createServerClient()
  } else if (allowSession) {
    const gate = await requireAdmin()
    if ('error' in gate && gate.error) return gate.error
    db = gate.supabase!
  } else {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Every enabled Drive source (drive_sources, migration 068), with
  // KB_DRIVE_FOLDER_ID as the implicit questions folder.
  const { sources } = await loadSyncSources(db, process.env.KB_DRIVE_FOLDER_ID)
  if (sources.length === 0) {
    return NextResponse.json({ error: 'KB_DRIVE_FOLDER_ID is not configured and no Drive source is enabled' }, { status: 500 })
  }
  const questionSources = sources.filter(s => s.contentType === 'questions')
  const contentSources: ContentSource[] = sources.flatMap(s =>
    s.contentType === 'questions' ? [] : [{ ...s, contentType: s.contentType }])

  try {
    const deadline = Date.now() + TIME_BUDGET_MS
    let drive: DriveGateway | null = null
    // Questions first, through the existing pipeline; listings and
    // announcements get whatever time is left (the rest resumes next run).
    // The gateway is made inside the logged run, so a missing service account
    // shows in History as a failed run.
    const summary = await logSyncRun(db, trigger, () => {
      drive = createDriveGateway()
      return syncQuestionSources(db, drive, createMediaStore(db), questionSources, { deadline })
    })
    if (contentSources.length === 0 || !drive) return NextResponse.json(summary)

    let content: ContentSyncSummary | { error: string }
    try {
      content = await syncContentSources(db, drive, contentSources, { deadline })
    } catch (err) {
      console.error('[kb/drive-sync] content sync failed:', err)
      content = { error: err instanceof Error ? err.message : 'Listings/announcements sync failed' }
    }
    return NextResponse.json({ ...summary, content })
  } catch (err) {
    console.error('[kb/drive-sync] failed:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Drive sync failed' }, { status: 500 })
  }
}

export const GET = (req: NextRequest) => run(req, false)
export const POST = (req: NextRequest) => run(req, true)
