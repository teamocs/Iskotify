import { flagWeakOptions } from '@/lib/heuristics/flagWeakOptions'

/**
 * Queue counts for the admin Home ("work inbox"). Read server-side with the
 * service-role client. Every count degrades on its own: a missing table (e.g.
 * kb_drive_files before migration 055) or a failed query marks THAT count
 * unavailable instead of failing the page or pretending the queue is empty.
 */

export type CountResult = { ok: true; count: number } | { ok: false }
export type SyncStatus = 'ok' | 'warn' | 'error'
export type LastSync = { ok: true; status: SyncStatus | null; at: string | null; message: string | null } | { ok: false }

export type QueueId =
  | 'drafts' | 'reviewQueue' | 'reports' | 'bugReports' | 'feedback'
  | 'dateCorrections' | 'driveNeedsMapping' | 'driveMissingFigures'

export type InboxCounts = Record<QueueId, CountResult> & { lastSync: LastSync }

export interface QueueDef { id: QueueId; group: 'Content' | 'Inbox'; label: string; description: string; href: string }

/** Display order is stable on purpose: a daily user learns where each queue sits. */
export const QUEUES: QueueDef[] = [
  { id: 'drafts', group: 'Content', label: 'Drafts awaiting publish', description: 'Topics imported but not live in the app yet.', href: '/admin/flashcards/drafts' },
  { id: 'reviewQueue', group: 'Content', label: 'Flagged distractors', description: 'Question options that may give the answer away.', href: '/admin/upcat/review-queue' },
  { id: 'driveNeedsMapping', group: 'Content', label: 'Drive files needing mapping', description: 'Files with no import rule yet.', href: '/admin/sync#drive-question-bank' },
  { id: 'driveMissingFigures', group: 'Content', label: 'Drive files missing figures', description: 'Imported files whose questions reference absent images.', href: '/admin/sync#drive-question-bank' },
  { id: 'reports', group: 'Inbox', label: 'Reported questions', description: 'New reports from students about a question.', href: '/admin/reports' },
  { id: 'bugReports', group: 'Inbox', label: 'Bug reports', description: 'New app problems reported from the mobile app.', href: '/admin/app-reports' },
  { id: 'feedback', group: 'Inbox', label: 'Feedback', description: 'New suggestions and comments.', href: '/admin/feedback' },
  { id: 'dateCorrections', group: 'Inbox', label: 'Date corrections', description: 'Pending deadline and exam-date suggestions.', href: '/admin/date-contributions' },
]

// Mirrors the review-queue page's own scan cap so the two numbers agree.
const REVIEW_SCAN_LIMIT = 2000

type Awaitable<T> = PromiseLike<T>
interface QueryResult { data?: unknown; count?: number | null; error?: { message: string } | null }
interface Builder extends Awaitable<QueryResult> {
  select(columns: string, opts?: { count?: 'exact'; head?: boolean }): Builder
  eq(column: string, value: unknown): Builder
  gt(column: string, value: unknown): Builder
  order(column: string, opts?: { ascending?: boolean }): Builder
  limit(n: number): Builder
}
export interface InboxDb { from(table: string): Builder }

async function exactCount(build: () => Builder): Promise<CountResult> {
  try {
    const { count, error } = await build()
    if (error || typeof count !== 'number') return { ok: false }
    return { ok: true, count }
  } catch {
    return { ok: false }
  }
}

async function reviewQueueCount(db: InboxDb): Promise<CountResult> {
  try {
    const { data, error } = await db.from('upcat_questions').select('options').order('question_id').limit(REVIEW_SCAN_LIMIT)
    if (error || !Array.isArray(data)) return { ok: false }
    const flagged = (data as { options: unknown }[]).filter(r => !flagWeakOptions(Array.isArray(r.options) ? (r.options as string[]) : []).clean)
    return { ok: true, count: flagged.length }
  } catch {
    return { ok: false }
  }
}

async function lastSync(db: InboxDb): Promise<LastSync> {
  try {
    const { data, error } = await db.from('sync_logs').select('status, created_at, message').order('created_at', { ascending: false }).limit(1)
    if (error || !Array.isArray(data)) return { ok: false }
    const row = data[0] as { status: SyncStatus; created_at: string; message: string | null } | undefined
    return row ? { ok: true, status: row.status, at: row.created_at, message: row.message ?? null } : { ok: true, status: null, at: null, message: null }
  } catch {
    return { ok: false }
  }
}

const UNAVAILABLE: InboxCounts = {
  drafts: { ok: false }, reviewQueue: { ok: false }, reports: { ok: false }, bugReports: { ok: false },
  feedback: { ok: false }, dateCorrections: { ok: false }, driveNeedsMapping: { ok: false },
  driveMissingFigures: { ok: false }, lastSync: { ok: false },
}

export async function getInboxCounts(db: InboxDb | null): Promise<InboxCounts> {
  if (!db) return UNAVAILABLE
  const head = { count: 'exact' as const, head: true }
  const count = (table: string) => db.from(table).select('*', head)

  const [drafts, reviewQueue, reports, bugReports, feedback, dateCorrections, driveNeedsMapping, driveMissingFigures, sync] = await Promise.all([
    exactCount(() => count('flashcard_topics').eq('status', 'draft')),
    reviewQueueCount(db),
    exactCount(() => count('question_reports').eq('status', 'new')),
    exactCount(() => count('app_bug_reports').eq('status', 'new')),
    exactCount(() => count('app_feedback').eq('status', 'new')),
    exactCount(() => count('listing_date_contributions').eq('status', 'pending')),
    exactCount(() => count('kb_drive_files').eq('status', 'needs_mapping')),
    exactCount(() => count('kb_drive_files').gt('rows_missing_media', 0)),
    lastSync(db),
  ])

  return { drafts, reviewQueue, reports, bugReports, feedback, dateCorrections, driveNeedsMapping, driveMissingFigures, lastSync: sync }
}

export function summarize(counts: InboxCounts): { total: number; busyQueues: number; unavailable: number } {
  let total = 0, busyQueues = 0, unavailable = 0
  for (const q of QUEUES) {
    const c = counts[q.id]
    if (!c.ok) { unavailable++; continue }
    total += c.count
    if (c.count > 0) busyQueues++
  }
  return { total, busyQueues, unavailable }
}

export function timeAgo(iso: string, now: number): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'

const STALE_AFTER_MS = 24 * 3600_000

export function describeSync(sync: LastSync, now: number): { tone: Tone; label: string; when: string | null } {
  if (!sync.ok) return { tone: 'neutral', label: 'Unavailable', when: null }
  if (!sync.status || !sync.at) return { tone: 'neutral', label: 'Never run', when: null }
  const when = timeAgo(sync.at, now)
  if (sync.status === 'error') return { tone: 'danger', label: 'Failed', when }
  if (sync.status === 'warn') return { tone: 'warning', label: 'Warnings', when }
  if (now - new Date(sync.at).getTime() > STALE_AFTER_MS) return { tone: 'warning', label: 'Stale', when }
  return { tone: 'success', label: 'OK', when }
}
