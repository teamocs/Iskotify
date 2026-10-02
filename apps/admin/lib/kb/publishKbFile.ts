// Publishes the drafts one Drive file imported, after admin review. Guards the
// live bank: a question is left as a draft when its figure is missing, when it
// can't be answered (fewer than 2 options, or a correct_index outside them), or
// when the same question+options is already live under another id. 2- and
// 3-option items (True/False, True/False/Cannot be certain syllogisms) publish:
// every mobile engine renders any number of choices (OptionList, ReviewCard,
// buildQuizQuestions — see their 3-option tests). Then re-runs the flashcard projection so the topic/deck
// quiz sees the new questions too.

import type { SupabaseClient } from '@supabase/supabase-js'
import { contentKey } from '../upcat/importUpcatCore'

export const MIN_OPTIONS_TO_PUBLISH = 2

/** At least two choices, and the answer key points at one of them. */
export function hasAnswerableChoices(q: { options: string[] | null; correct_index: number | null }): boolean {
  const n = (q.options ?? []).length
  const ci = q.correct_index
  return n >= MIN_OPTIONS_TO_PUBLISH && Number.isInteger(ci) && ci! >= 0 && ci! < n
}

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
  correct_index: number | null
  status: string
  has_visual: boolean
  image_url: string | null
}

export async function publishKbFile(db: SupabaseClient, driveFileId: string, publishedBy?: string): Promise<PublishResult> {
  const { data: files, error: fileErr } = await db
    .from('kb_drive_files')
    .select('drive_file_id, name, question_ids')
    .eq('drive_file_id', driveFileId)
  if (fileErr) throw new Error(`kb_drive_files read failed: ${fileErr.message}`)
  const file = (files ?? [])[0] as { name?: string; question_ids: string[] | null } | undefined
  if (!file) throw new Error(`Drive file ${driveFileId} not found in the sync ledger`)
  const ids = file.question_ids ?? []

  const rows: QRow[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from('upcat_questions')
      .select('question_id, question_text, options, correct_index, status, has_visual, image_url')
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
    if (!hasAnswerableChoices(q)) { result.skippedFewOptions++; continue }
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

  // Published: the file leaves Preview for History. Held-back questions stay
  // drafts; the event below says how many and why.
  const { error: ledgerErr } = await db
    .from('kb_drive_files')
    .update({ published_at: new Date().toISOString() })
    .eq('drive_file_id', driveFileId)
  if (ledgerErr) throw new Error(`kb_drive_files write failed: ${ledgerErr.message}`)

  const { error: eventErr } = await db.from('kb_publish_events').insert({
    drive_file_id: driveFileId,
    file_name: file.name ?? driveFileId,
    published: result.published,
    already_published: result.alreadyPublished,
    held_missing_media: result.skippedMissingMedia,
    held_few_options: result.skippedFewOptions,
    held_duplicate: result.skippedDuplicate,
    published_by: publishedBy ?? null,
  })
  // The questions are already live; a missing history row must not report the publish as failed.
  if (eventErr) console.warn('[kb/publish] publish event not recorded:', eventErr.message)

  return result
}
