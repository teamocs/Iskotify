import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanImportedText, letterToIndex } from '../csv/cleaners'

export interface RawUpcatRow {
  question_id: string; subtest: string; main_subject: string; topic: string; subtopic: string
  question_format: string; cognitive_level: string; difficulty: string; curriculum_alignment: string
  has_visual: string; visual_type: string; visual_description: string
  set_id: string; set_position: string; passage_text: string
  question_text: string; option_a: string; option_b: string; option_c: string; option_d: string
  correct_answer: string; explanation: string; status: string
}

export interface ImportUpcatResult { passages: number; questions: number; duplicatesDrafted: number }

// Content fingerprint for duplicate detection. Compares question text AND options
// (NOT text alone) — many legitimate questions share a generic stem ("Choose the
// correctly spelled word.", "What is the main idea of the passage?") but differ in
// their options, so a text-only check would wrongly flag them.
function contentKey(text: string, options: string[]): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  return norm(text) + ' ||| ' + options.map(norm).join(' | ')
}

// Must match the mobile client's SUBTESTS (apps/mobile/utils/upcatExam.ts); rows
// with any other subtest would never surface in a built exam, so we reject them.
export const VALID_SUBTESTS = [
  'Mathematics',
  'Science',
  'Language Proficiency',
  'Reading Comprehension',
] as const

export async function importUpcatCore(client: SupabaseClient, rows: RawUpcatRow[]): Promise<ImportUpcatResult> {
  // 0. Validate subtests up-front (clear, all-at-once error) so a typo can't
  //    silently hide a whole batch from the mobile exam builder.
  const valid = new Set<string>(VALID_SUBTESTS)
  const badSubtests = new Map<string, string>() // subtest value -> first offending question_id
  for (const r of rows) {
    const st = cleanImportedText(r.subtest)
    if (!valid.has(st)) badSubtests.set(st || '(empty)', cleanImportedText(r.question_id))
  }
  if (badSubtests.size > 0) {
    const detail = [...badSubtests.entries()].map(([s, qid]) => `"${s}" (e.g. ${qid})`).join(', ')
    throw new Error(
      `Invalid subtest value(s): ${detail}. Allowed: ${VALID_SUBTESTS.join(', ')}.`,
    )
  }

  // 1. Collect distinct passages (first non-empty passage_text per set_id)
  const passages = new Map<string, { set_id: string; subtest: string; passage_text: string }>()
  for (const r of rows) {
    const setId = cleanImportedText(r.set_id)
    if (!setId) continue
    const text = cleanImportedText(r.passage_text)
    if (text && !passages.has(setId)) {
      passages.set(setId, { set_id: setId, subtest: cleanImportedText(r.subtest), passage_text: text })
    }
  }
  if (passages.size > 0) {
    const { error } = await client.from('upcat_passages').upsert([...passages.values()], { onConflict: 'set_id' })
    if (error) throw new Error(`passage upsert failed: ${error.message}`)
  }

  // 2. Build question rows
  const questionRows = rows.map((r) => {
    const setId = cleanImportedText(r.set_id)
    return {
      question_id: cleanImportedText(r.question_id),
      subtest: cleanImportedText(r.subtest),
      main_subject: cleanImportedText(r.main_subject) || null,
      topic: cleanImportedText(r.topic) || null,
      subtopic: cleanImportedText(r.subtopic) || null,
      question_format: cleanImportedText(r.question_format) || null,
      cognitive_level: cleanImportedText(r.cognitive_level) || null,
      difficulty: cleanImportedText(r.difficulty) || null,
      curriculum_alignment: cleanImportedText(r.curriculum_alignment) || null,
      question_text: cleanImportedText(r.question_text),
      options: [r.option_a, r.option_b, r.option_c, r.option_d].map(o => cleanImportedText(o)),
      correct_index: letterToIndex(r.correct_answer),
      explanation: cleanImportedText(r.explanation),
      set_id: setId || null,
      set_position: (() => { const sp = parseInt(cleanImportedText(r.set_position), 10); return Number.isNaN(sp) ? null : sp })(),
      has_visual: cleanImportedText(r.has_visual).toLowerCase() === 'yes',
      status: cleanImportedText(r.status).toLowerCase() === 'approved' ? 'published' : 'draft',
    }
  })

  // 3. Dedup guard — a question that duplicates an existing one (same text+options
  //    under a DIFFERENT question_id) or an earlier row in this batch must NOT be
  //    published. Demote it to 'draft' so an admin can review/merge instead of
  //    silently shipping a duplicate into the live exam. (Re-importing the same
  //    question_id is an update, not a duplicate.)
  const existing: { question_id: string; question_text: string; options: unknown }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error: selErr } = await client
      .from('upcat_questions')
      .select('question_id,question_text,options')
      .range(from, from + 999)
    if (selErr) break
    const batch = (data ?? []) as { question_id: string; question_text: string; options: unknown }[]
    existing.push(...batch)
    if (batch.length < 1000) break
  }
  const keyToIds = new Map<string, Set<string>>()
  for (const e of existing) {
    const opts = Array.isArray(e.options) ? (e.options as string[]) : []
    const k = contentKey(e.question_text ?? '', opts)
    if (!keyToIds.has(k)) keyToIds.set(k, new Set())
    keyToIds.get(k)!.add(e.question_id)
  }
  let duplicatesDrafted = 0
  const batchSeen = new Map<string, string>() // contentKey -> first question_id in this batch
  for (const row of questionRows) {
    const k = contentKey(row.question_text, row.options)
    const dupExisting = (keyToIds.get(k) && [...keyToIds.get(k)!].some(id => id !== row.question_id)) || false
    const dupBatch = batchSeen.has(k) && batchSeen.get(k) !== row.question_id
    if ((dupExisting || dupBatch) && row.status === 'published') {
      row.status = 'draft'
      duplicatesDrafted++
    }
    if (!batchSeen.has(k)) batchSeen.set(k, row.question_id)
  }

  const { error } = await client.from('upcat_questions').upsert(questionRows, { onConflict: 'question_id' })
  if (error) throw new Error(`question upsert failed: ${error.message}`)

  return { passages: passages.size, questions: questionRows.length, duplicatesDrafted }
}
