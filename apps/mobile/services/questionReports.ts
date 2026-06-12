import { eq } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { questionFeedback } from '../db/schema'
import { supabase } from './supabase'

// ── Question reports (offline-first) ──────────────────────────────────────────
// Reports are ALWAYS written to the local question_feedback queue first, then
// uploaded to Supabase question_reports best-effort. Upload failures never
// surface to the UI — the row simply stays synced=0 and pushPendingReports
// retries it on the next app launch (wired into syncOnLaunch).

export type ReportSourceTable = 'flashcards' | 'upcat_questions'

export interface QuestionReportInput {
  questionId: string
  sourceTable: ReportSourceTable
  questionText: string
  reason: string
}

/** Snapshot cap — keeps the Supabase row small even for passage-length stems. */
const SNAPSHOT_MAX_CHARS = 500

/** Best-effort upload of one report to Supabase. Returns true only on success. */
async function uploadReport(report: QuestionReportInput): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const { error } = await supabase.from('question_reports').insert({
      question_id: report.questionId,
      source_table: report.sourceTable,
      question_text: report.questionText.slice(0, SNAPSHOT_MAX_CHARS),
      reason: report.reason,
      user_id: session?.user?.id ?? null,
    })
    return !error
  } catch {
    return false  // offline / network error — caller keeps the row queued
  }
}

/**
 * Record a question report: local queue row first (source of truth), then an
 * immediate best-effort upload. Never throws on upload failure.
 */
export async function submitQuestionReport(db: DrizzleClient, input: QuestionReportInput): Promise<void> {
  const inserted = await db.insert(questionFeedback).values({
    cardId: input.questionId,
    reason: input.reason,
    createdAt: Date.now(),
    sourceTable: input.sourceTable,
    questionText: input.questionText.slice(0, SNAPSHOT_MAX_CHARS),
    synced: 0,
  }).returning({ id: questionFeedback.id })

  const ok = await uploadReport(input)
  const localId = inserted[0]?.id
  if (ok && localId != null) {
    await db.update(questionFeedback).set({ synced: 1 }).where(eq(questionFeedback.id, localId))
  }
}

/**
 * Retry queued (synced=0) reports. Called fire-and-forget after syncOnLaunch —
 * all errors are swallowed so it can never break the launch path.
 */
export async function pushPendingReports(db: DrizzleClient): Promise<void> {
  try {
    const pending = await db.select().from(questionFeedback).where(eq(questionFeedback.synced, 0))
    for (const row of pending) {
      const ok = await uploadReport({
        questionId: row.cardId,
        sourceTable: row.sourceTable === 'upcat_questions' ? 'upcat_questions' : 'flashcards',
        questionText: row.questionText,
        reason: row.reason,
      })
      if (ok) {
        await db.update(questionFeedback).set({ synced: 1 }).where(eq(questionFeedback.id, row.id))
      }
    }
  } catch {
    // offline or unexpected shape — rows stay queued for the next launch
  }
}
