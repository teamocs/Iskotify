// Publishes the drafts one Drive file imported, after admin review. Guards the
// live bank: a question is left as a draft when its figure is missing, when it
// has fewer than 4 options (3-option items stay parked until the product
// decision to ship them), or when the same question+options is already live
// under another id. Then re-runs the flashcard projection so the topic/deck
// quiz sees the new questions too.

import type { SupabaseClient } from '@supabase/supabase-js'
import { contentKey } from '../upcat/importUpcatCore'

export const MIN_OPTIONS_TO_PUBLISH = 4

export interface PublishResult {
  published: number
  alreadyPublished: number
  skippedMissingMedia: number
  skippedFewOptions: number
  skippedDuplicate: number
}

interface QRow {
  question_id: string
  question_text: string
  options: string[] | null
  status: string
  has_visual: boolean
  image_url: string | null
}

export async function publishKbFile(db: SupabaseClient, driveFileId: string): Promise<PublishResult> {
  const { data: files, error: fileErr } = await db
    .from('kb_drive_files')
    .select('drive_file_id, question_ids')
    .eq('drive_file_id', driveFileId)
  if (fileErr) throw new Error(`kb_drive_files read failed: ${fileErr.message}`)
  const file = (files ?? [])[0] as { question_ids: string[] | null } | undefined
  if (!file) throw new Error(`Drive file ${driveFileId} not found in the sync ledger`)
  const ids = file.question_ids ?? []

  const rows: QRow[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from('upcat_questions')
      .select('question_id, question_text, options, status, has_visual, image_url')
      .in('question_id', ids.slice(i, i + 200))
    if (error) throw new Error(`upcat_questions read failed: ${error.message}`)
    rows.push(...((data ?? []) as QRow[]))
  }

  // Content keys already live in the bank, from any source.
  const liveKeyIds = new Map<string, Set<string>>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('upcat_questions')
      .select('question_id, question_text, options')
      .eq('status', 'published')
      .range(from, from + 999)
    if (error) throw new Error(`upcat_questions read failed: ${error.message}`)
    const batch = (data ?? []) as QRow[]
    for (const q of batch) {
      const k = contentKey(q.question_text ?? '', q.options ?? [])
      if (!liveKeyIds.has(k)) liveKeyIds.set(k, new Set())
      liveKeyIds.get(k)!.add(q.question_id)
    }
    if (batch.length < 1000) break
  }

  const result: PublishResult = { published: 0, alreadyPublished: 0, skippedMissingMedia: 0, skippedFewOptions: 0, skippedDuplicate: 0 }
  const toPublish: string[] = []
  const seen = new Set<string>()
  for (const q of rows) {
    if (q.status === 'published') { result.alreadyPublished++; continue }
    if (q.has_visual && !q.image_url) { result.skippedMissingMedia++; continue }
    if ((q.options ?? []).length < MIN_OPTIONS_TO_PUBLISH) { result.skippedFewOptions++; continue }
    const k = contentKey(q.question_text ?? '', q.options ?? [])
    const liveOthers = [...(liveKeyIds.get(k) ?? [])].some(id => id !== q.question_id)
    if (liveOthers || seen.has(k)) { result.skippedDuplicate++; continue }
    seen.add(k)
    toPublish.push(q.question_id)
  }

  for (let i = 0; i < toPublish.length; i += 200) {
    const { error } = await db
      .from('upcat_questions')
      .update({ status: 'published' })
      .in('question_id', toPublish.slice(i, i + 200))
    if (error) throw new Error(`publish failed: ${error.message}`)
  }
  result.published = toPublish.length

  if (toPublish.length > 0) {
    const { error } = await db.rpc('project_question_bank_to_flashcards')
    if (error) throw new Error(`flashcard projection failed: ${error.message}`)
  }

  const { error: ledgerErr } = await db
    .from('kb_drive_files')
    .update({ published_at: new Date().toISOString() })
    .eq('drive_file_id', driveFileId)
  if (ledgerErr) throw new Error(`kb_drive_files write failed: ${ledgerErr.message}`)

  return result
}
