// Admin side of Drive file mappings: what the mapping dialog shows, saving or
// clearing an admin's mapping (then re-syncing just that file so its questions
// land in Preview straight away), and an on-demand AI suggestion to prefill
// the dialog. The re-sync is injected so this is testable without Drive.

import type { SupabaseClient } from '@supabase/supabase-js'
import { suggestColumnMap, type AskModel } from '../ai/mapColumns'
import { resolveFileRule } from './fileRules'
import { kbMappingSpec, mappingFromAi, parseMappingInput, type KbMapping } from './mapping'
import type { SyncSummary } from './syncDriveFolder'

export type Resync = (driveFileId: string) => Promise<SyncSummary>

export interface MappingContext {
  name: string
  status: string
  headers: string[]
  sampleRows: Record<string, string>[]
  mapping: KbMapping | null
  /** The pool the file name already fixes (a file rule), if any. */
  rulePool: { subtest: string } | null
}

type SaveResult = { ok: true; summary: SyncSummary; mapping: KbMapping } | { ok: false; status: number; error: string }

export async function loadMappingContext(db: SupabaseClient, driveFileId: string): Promise<MappingContext | null> {
  const [{ data: files, error }, { data: maps, error: mapErr }] = await Promise.all([
    db.from('kb_drive_files').select('drive_file_id, name, status, headers, sample_rows').eq('drive_file_id', driveFileId),
    db.from('kb_file_mappings').select('drive_file_id, subtest, main_subject, skill_category, columns, source').eq('drive_file_id', driveFileId),
  ])
  if (error) throw new Error(`kb_drive_files read failed: ${error.message}`)
  if (mapErr) throw new Error(`kb_file_mappings read failed: ${mapErr.message}`)
  const file = (files ?? [])[0] as { name: string; status: string; headers: string[] | null; sample_rows: Record<string, string>[] | null } | undefined
  if (!file) return null
  const saved = (maps ?? [])[0] as { subtest: string; main_subject: string; skill_category: string; columns: KbMapping['columns']; source: KbMapping['source'] } | undefined
  const rule = resolveFileRule(file.name)
  return {
    name: file.name,
    status: file.status,
    headers: file.headers ?? [],
    sampleRows: file.sample_rows ?? [],
    mapping: saved
      ? { subtest: saved.subtest, mainSubject: saved.main_subject, skillCategory: saved.skill_category, columns: saved.columns, source: saved.source }
      : null,
    rulePool: rule?.kind === 'import' ? { subtest: rule.subtest } : null,
  }
}

export async function saveMapping(db: SupabaseClient, driveFileId: string, input: unknown, resync: Resync): Promise<SaveResult> {
  const ctx = await loadMappingContext(db, driveFileId)
  if (!ctx) return { ok: false, status: 404, error: 'This file is not in the sync ledger.' }
  if (ctx.headers.length === 0) return { ok: false, status: 409, error: 'This file’s columns haven’t been read yet — run a sync first.' }
  const mapping = parseMappingInput(input, ctx.headers)
  if (typeof mapping === 'string') return { ok: false, status: 400, error: mapping }

  const { error } = await db.from('kb_file_mappings').upsert({
    drive_file_id: driveFileId,
    subtest: mapping.subtest,
    main_subject: mapping.mainSubject,
    skill_category: mapping.skillCategory,
    columns: mapping.columns,
    source: 'admin',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'drive_file_id' })
  if (error) throw new Error(`kb_file_mappings write failed: ${error.message}`)
  return { ok: true, mapping, summary: await resync(driveFileId) }
}

export async function clearMapping(db: SupabaseClient, driveFileId: string, resync: Resync): Promise<SyncSummary> {
  const { error } = await db.from('kb_file_mappings').delete().eq('drive_file_id', driveFileId)
  if (error) throw new Error(`kb_file_mappings delete failed: ${error.message}`)
  return resync(driveFileId)
}

export async function suggestMapping(db: SupabaseClient, driveFileId: string, ask?: AskModel): Promise<KbMapping | null> {
  const ctx = await loadMappingContext(db, driveFileId)
  if (!ctx || ctx.headers.length === 0) return null
  const rule = resolveFileRule(ctx.name)
  const pool = rule?.kind === 'import' ? { subtest: rule.subtest, mainSubject: rule.mainSubject } : null
  const ai = await suggestColumnMap(kbMappingSpec(ctx.name, { headers: ctx.headers, records: ctx.sampleRows }, !pool), ask)
  return ai ? mappingFromAi(ai, pool) : null
}
