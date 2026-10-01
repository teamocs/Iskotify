import { inArray } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { supabase } from './supabase'
import { flashcards, topics, upcatQuestions } from '../db/schema'

// ── Content status feed ───────────────────────────────────────────────────────
// Supabase migration 065 makes upcat_questions / flashcards / flashcard_topics
// readable only while status = 'published', so the `updated_at > since` delta
// pull no longer sees a row being unpublished, and never saw a hard delete.
// The content_status_feed RPC returns just (kind, id, status, changed_at) for
// rows that became non-published or were deleted since the cursor. The device
// marks those local rows 'draft' (local readers already filter 'published').
// Rows are never deleted locally: progress, attempts and SRS may reference them.

export type ContentStatusRow = {
  kind: 'question' | 'flashcard' | 'topic'
  id: string
  status: string // 'draft' | 'deleted'
  changed_at: string
}

export const CONTENT_STATUS_FEED_PAGE_SIZE = 1000

/** The server predates migration 065 (no such function): PostgREST PGRST202 / Postgres 42883. */
export function isRpcMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  return code === 'PGRST202' || code === '42883'
}

/**
 * Every feed row changed after `since`. Pages by keyset: the last row's
 * (changed_at, kind, id) is the next page's cursor, and changed_at is passed back
 * verbatim (microsecond precision; a Date round-trip would truncate it), so a
 * bulk change that stamped many rows with one now() is never skipped.
 * Resolves null when the server has no feed (old server); throws on any other
 * error so the caller does not advance its cursor past a page it never applied.
 */
export async function fetchContentStatusFeed(
  since: string,
  pageSize = CONTENT_STATUS_FEED_PAGE_SIZE,
): Promise<ContentStatusRow[] | null> {
  const out: ContentStatusRow[] = []
  let args: Record<string, unknown> = { p_since: since, p_limit: pageSize }
  for (;;) {
    const { data, error } = await supabase.rpc('content_status_feed', args)
    if (error) {
      if (out.length === 0 && isRpcMissingError(error)) {
        console.warn('[sync] content_status_feed not on the server yet (migration 065) — skipping', error)
        return null
      }
      throw error
    }
    const rows = (data ?? []) as ContentStatusRow[]
    out.push(...rows)
    if (rows.length < pageSize) return out
    const last = rows[rows.length - 1]!
    args = { p_since: last.changed_at, p_limit: pageSize, p_after_kind: last.kind, p_after_id: last.id }
  }
}

// Minimal structural view of a drizzle sqlite transaction (see syncBatch.ts).
export interface StatusUpdateTx {
  update(table: SQLiteTable): {
    set(values: Record<string, unknown>): { where(cond: SQL | undefined): { run(): unknown } }
  }
}

// Well under SQLite's 999 bound-parameter floor (one param per id + the status).
const IDS_PER_STATEMENT = 500

const TARGETS: Record<ContentStatusRow['kind'], { table: SQLiteTable; key: SQLiteColumn }> = {
  question: { table: upcatQuestions, key: upcatQuestions.questionId },
  flashcard: { table: flashcards, key: flashcards.id },
  topic: { table: topics, key: topics.id },
}

/** Mark every feed row (draft or deleted) as not published on the device. */
export function applyContentStatusFeed(tx: StatusUpdateTx, rows: ContentStatusRow[]): void {
  for (const kind of Object.keys(TARGETS) as ContentStatusRow['kind'][]) {
    const ids = [...new Set(rows.filter(r => r.kind === kind).map(r => r.id))]
    const { table, key } = TARGETS[kind]
    for (let i = 0; i < ids.length; i += IDS_PER_STATEMENT) {
      tx.update(table).set({ status: 'draft' }).where(inArray(key, ids.slice(i, i + IDS_PER_STATEMENT))).run()
    }
  }
}
