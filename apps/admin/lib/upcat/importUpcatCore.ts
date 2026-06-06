import type { SupabaseClient } from '@supabase/supabase-js'
import { stripBom, letterToIndex } from '../csv/cleaners'

export interface RawUpcatRow {
  question_id: string; subtest: string; main_subject: string; topic: string; subtopic: string
  question_format: string; cognitive_level: string; difficulty: string; curriculum_alignment: string
  has_visual: string; visual_type: string; visual_description: string
  set_id: string; set_position: string; passage_text: string
  question_text: string; option_a: string; option_b: string; option_c: string; option_d: string
  correct_answer: string; explanation: string; status: string
}

export interface ImportUpcatResult { passages: number; questions: number }

export async function importUpcatCore(client: SupabaseClient, rows: RawUpcatRow[]): Promise<ImportUpcatResult> {
  // 1. Collect distinct passages (first non-empty passage_text per set_id)
  const passages = new Map<string, { set_id: string; subtest: string; passage_text: string }>()
  for (const r of rows) {
    const setId = (r.set_id ?? '').trim()
    if (!setId) continue
    const text = (r.passage_text ?? '').trim()
    if (text && !passages.has(setId)) {
      passages.set(setId, { set_id: setId, subtest: (r.subtest ?? '').trim(), passage_text: text })
    }
  }
  if (passages.size > 0) {
    const { error } = await client.from('upcat_passages').upsert([...passages.values()], { onConflict: 'set_id' })
    if (error) throw new Error(`passage upsert failed: ${error.message}`)
  }

  // 2. Build question rows
  const questionRows = rows.map((r, i) => {
    const qid = (i === 0 ? stripBom(r.question_id ?? '') : (r.question_id ?? '')).trim()
    const setId = (r.set_id ?? '').trim()
    return {
      question_id: qid,
      subtest: (r.subtest ?? '').trim(),
      main_subject: (r.main_subject ?? '').trim() || null,
      topic: (r.topic ?? '').trim() || null,
      subtopic: (r.subtopic ?? '').trim() || null,
      question_format: (r.question_format ?? '').trim() || null,
      cognitive_level: (r.cognitive_level ?? '').trim() || null,
      difficulty: (r.difficulty ?? '').trim() || null,
      curriculum_alignment: (r.curriculum_alignment ?? '').trim() || null,
      question_text: (r.question_text ?? '').trim(),
      options: [r.option_a, r.option_b, r.option_c, r.option_d].map(o => (o ?? '').trim()),
      correct_index: letterToIndex(r.correct_answer),
      explanation: (r.explanation ?? '').trim(),
      set_id: setId || null,
      set_position: (r.set_position ?? '').trim() ? parseInt(r.set_position, 10) : null,
      has_visual: (r.has_visual ?? '').trim().toLowerCase() === 'yes',
      status: (r.status ?? '').trim().toLowerCase() === 'approved' ? 'published' : 'draft',
    }
  })

  const { error } = await client.from('upcat_questions').upsert(questionRows, { onConflict: 'question_id' })
  if (error) throw new Error(`question upsert failed: ${error.message}`)

  return { passages: passages.size, questions: questionRows.length }
}
