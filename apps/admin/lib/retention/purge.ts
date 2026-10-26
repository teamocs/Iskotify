import type { createServerClient } from '@iskotify/utils'
import { BUG_SCREENSHOT_BUCKET, bugScreenshotPath } from '@/lib/admin/bugScreenshot'

// Enforces the Privacy Policy's "How long we keep it" (packages/utils/src/privacyPolicy.ts):
// bug reports and their screenshots 12 months after the report is closed;
// feedback, question reports and date suggestions 12 months after they were sent.
// Early-access sign-ups are kept "until 6 months after Iskotify launches publicly",
// so they are left alone until a launch date exists.
export const RETENTION_DAYS = 365

const SENT_TABLES = ['app_feedback', 'question_reports', 'listing_date_contributions'] as const
// ponytail: one batch per daily run; a backlog drains over a few days.
const BUG_BATCH = 500

type Db = ReturnType<typeof createServerClient>

export async function purgeExpired(db: Db, now: Date) {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString()
  const deleted: Record<string, number> = {}

  // Resolved bug reports: remove the screenshot files first, so a failure never
  // leaves files whose rows (and paths) are already gone.
  const { data: reports, error: lookupError } = await db
    .from('app_bug_reports')
    .select('id, image_url')
    .eq('status', 'resolved')
    .lt('updated_at', cutoff)
    .limit(BUG_BATCH)
  if (lookupError) throw new Error(`bug report lookup failed: ${lookupError.message}`)
  const rows = (reports ?? []) as { id: string; image_url: string | null }[]
  if (rows.length > 0) {
    const paths = [...new Set(rows.map(r => bugScreenshotPath(r.image_url)).filter((p): p is string => !!p))]
    if (paths.length > 0) {
      const { error } = await db.storage.from(BUG_SCREENSHOT_BUCKET).remove(paths)
      if (error) throw new Error(`screenshot removal failed: ${error.message}`)
    }
    const { error, count } = await db.from('app_bug_reports').delete({ count: 'exact' }).in('id', rows.map(r => r.id))
    if (error) throw new Error(`bug report delete failed: ${error.message}`)
    deleted.app_bug_reports = count ?? 0
  } else {
    deleted.app_bug_reports = 0
  }

  for (const table of SENT_TABLES) {
    const { error, count } = await db.from(table).delete({ count: 'exact' }).lt('created_at', cutoff)
    if (error) throw new Error(`${table} delete failed: ${error.message}`)
    deleted[table] = count ?? 0
  }

  return { cutoff, deleted }
}
