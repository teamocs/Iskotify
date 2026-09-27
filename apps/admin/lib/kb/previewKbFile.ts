// The Preview step of the Drive sync: the draft questions one file imported,
// each tagged with why Publish would hold it back (a missing figure, or only 3
// options — see publishKbFile). Duplicate-of-live checks need the whole bank,
// so they are left to Publish itself.

import type { SupabaseClient } from '@supabase/supabase-js'
import { MIN_OPTIONS_TO_PUBLISH } from './publishKbFile'

export type HoldReason = 'missing_figure' | 'few_options'
export type PreviewFilter = 'all' | 'ready' | 'held'

export interface PreviewItem {
  question_id: string
  question_text: string
  options: string[]
  correct_index: number
  explanation: string | null
  topic: string | null
  subtopic: string | null
  difficulty: string | null
  image_url: string | null
  image_alt: string | null
  has_visual: boolean
  passage_text: string | null
  hold: HoldReason | null
}

export interface PreviewResult {
  total: number
  counts: { drafts: number; ready: number; missingFigure: number; fewOptions: number }
  items: PreviewItem[]
}

const COLUMNS = 'question_id, question_text, options, correct_index, explanation, topic, subtopic, difficulty, image_url, image_alt, has_visual, set_id, status'

type Row = Omit<PreviewItem, 'passage_text' | 'hold'> & { set_id: string | null; status: string }

export function holdReason(q: { has_visual: boolean; image_url: string | null; options: string[] | null }): HoldReason | null {
  if (q.has_visual && !q.image_url) return 'missing_figure'
  if ((q.options ?? []).length < MIN_OPTIONS_TO_PUBLISH) return 'few_options'
  return null
}

export async function previewKbFile(
  db: SupabaseClient,
  driveFileId: string,
  opts: { filter?: PreviewFilter; offset?: number; limit?: number } = {},
): Promise<PreviewResult> {
  const { data: files, error: fileErr } = await db
    .from('kb_drive_files')
    .select('drive_file_id, question_ids')
    .eq('drive_file_id', driveFileId)
  if (fileErr) throw new Error(`kb_drive_files read failed: ${fileErr.message}`)
  const file = (files ?? [])[0] as { question_ids: string[] | null } | undefined
  if (!file) throw new Error(`Drive file ${driveFileId} not found in the sync ledger`)
  const ids = file.question_ids ?? []

  const drafts: Row[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from('upcat_questions').select(COLUMNS).in('question_id', ids.slice(i, i + 200))
    if (error) throw new Error(`upcat_questions read failed: ${error.message}`)
    for (const q of (data ?? []) as Row[]) if (q.status !== 'published') drafts.push(q)
  }
  // Keep the file's own row order.
  const order = new Map(ids.map((id, i) => [id, i]))
  drafts.sort((a, b) => (order.get(a.question_id) ?? 0) - (order.get(b.question_id) ?? 0))

  const tagged = drafts.map(q => ({ q, hold: holdReason(q) }))
  const counts = {
    drafts: tagged.length,
    ready: tagged.filter(t => !t.hold).length,
    missingFigure: tagged.filter(t => t.hold === 'missing_figure').length,
    fewOptions: tagged.filter(t => t.hold === 'few_options').length,
  }
  const filter = opts.filter ?? 'all'
  const matching = tagged.filter(t => filter === 'all' || (filter === 'held') === !!t.hold)
  const offset = Math.max(0, opts.offset ?? 0)
  const limit = Math.min(100, Math.max(1, opts.limit ?? 25))
  const page = matching.slice(offset, offset + limit)

  const setIds = [...new Set(page.map(t => t.q.set_id).filter((s): s is string => !!s))]
  const passages = new Map<string, string>()
  if (setIds.length) {
    const { data, error } = await db.from('upcat_passages').select('set_id, passage_text').in('set_id', setIds)
    if (error) throw new Error(`upcat_passages read failed: ${error.message}`)
    for (const p of (data ?? []) as { set_id: string; passage_text: string }[]) passages.set(p.set_id, p.passage_text)
  }

  return {
    total: matching.length,
    counts,
    items: page.map(({ q, hold }) => {
      const { set_id, status: _status, ...rest } = q
      return { ...rest, options: q.options ?? [], passage_text: set_id ? passages.get(set_id) ?? null : null, hold }
    }),
  }
}
