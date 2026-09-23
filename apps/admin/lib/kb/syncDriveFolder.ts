// Google Drive → question bank sync. Lists the knowledge-base folder, and for
// every new or changed question file: parses it, attaches its figures (uploaded
// once to the question-media bucket, content-addressed), and upserts it through
// importUpcatCore as drafts. kb_drive_files is the ledger that makes re-runs
// incremental and lets a run that hits the time budget resume next time.
//
// Drive and Storage are injected (DriveGateway / MediaStore) so the whole flow
// is testable without network; the real adapters live in driveClient.ts.

import Papa from 'papaparse'
import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { importUpcatCore } from '../upcat/importUpcatCore'
import { cleanImportedText } from '../csv/cleaners'
import { resolveFileRule, KB_EXTRA_SUBTESTS } from './fileRules'
import { detectDialect, convertRecords, type KbRow } from './dialects'
import { readImageSize, mimeForExt } from './imageSize'

export interface DriveEntry {
  id: string
  name: string
  mimeType: string
  md5Checksum?: string | null
  modifiedTime?: string | null
  size?: number | null
  /** Folder path from the sync root, e.g. "Iskotify Questions/diagrams". */
  path: string
}

export interface DriveGateway {
  listTree(rootId: string): Promise<DriveEntry[]>
  downloadText(entry: DriveEntry): Promise<string>
  downloadBytes(entry: DriveEntry): Promise<Buffer>
}

export interface MediaStore {
  /** Store bytes under `key` (idempotent) and return the public URL. */
  upload(key: string, bytes: Buffer, contentType: string): Promise<string>
}

export interface SyncOptions {
  rootId: string
  /** Epoch ms after which no new file is started (the current one finishes). */
  deadline?: number
  now?: () => number
}

export interface FileOutcome {
  driveFileId: string
  name: string
  rows?: number
  missingMedia?: number
  rejected?: number
  message?: string
}

export interface SyncSummary {
  imported: FileOutcome[]
  skipped: FileOutcome[]
  needsMapping: FileOutcome[]
  errors: FileOutcome[]
  unchanged: number
  remaining: number
}

const SHEET_MIME = 'application/vnd.google-apps.spreadsheet'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const MAX_SHEET_BYTES = 10 * 1024 * 1024
const MAX_FIGURE_BYTES = 5 * 1024 * 1024 // question-media bucket limit
const IMPORT_CHUNK = 1000
const LETTERS = ['A', 'B', 'C', 'D']

interface LedgerRow {
  drive_file_id: string
  md5_checksum: string | null
  drive_modified_at: string | null
  status: string
}

const isImage = (e: DriveEntry) => e.mimeType.startsWith('image/')
const isCsv = (e: DriveEntry) => e.mimeType === 'text/csv' || /\.csv$/i.test(e.name)

/** Normalised, case-insensitive lookup key for a path relative to the root. */
function pathKey(...parts: string[]): string {
  const out: string[] = []
  for (const seg of parts.join('/').split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return out.join('/').toLowerCase()
}

function isUnchanged(e: DriveEntry, led: LedgerRow | undefined): boolean {
  if (!led || led.status === 'error') return false
  if (e.md5Checksum) return led.md5_checksum === e.md5Checksum
  // Native Google Sheets have no md5 — fall back to the modified time.
  return !!e.modifiedTime && !!led.drive_modified_at &&
    Date.parse(led.drive_modified_at) === Date.parse(e.modifiedTime)
}

export async function syncDriveFolder(
  db: SupabaseClient,
  drive: DriveGateway,
  media: MediaStore,
  opts: SyncOptions,
): Promise<SyncSummary> {
  const now = opts.now ?? Date.now
  const summary: SyncSummary = { imported: [], skipped: [], needsMapping: [], errors: [], unchanged: 0, remaining: 0 }

  const entries = await drive.listTree(opts.rootId)
  const images = new Map(entries.filter(isImage).map(e => [pathKey(e.path, e.name), e]))
  const candidates = entries.filter(e => !isImage(e) && e.mimeType !== FOLDER_MIME)

  const { data: ledgerData, error: ledgerErr } = await db
    .from('kb_drive_files')
    .select('drive_file_id, md5_checksum, drive_modified_at, status')
  if (ledgerErr) throw new Error(`kb_drive_files read failed: ${ledgerErr.message}`)
  const ledger = new Map(((ledgerData ?? []) as LedgerRow[]).map(r => [r.drive_file_id, r]))

  const todo = candidates.filter(e => {
    if (isUnchanged(e, ledger.get(e.id))) { summary.unchanged++; return false }
    return true
  })

  const figureCache = new Map<string, { url: string; width: number | null; height: number | null }>()

  for (let i = 0; i < todo.length; i++) {
    if (opts.deadline !== undefined && now() >= opts.deadline) {
      summary.remaining = todo.length - i
      break
    }
    const e = todo[i]!
    const base = {
      drive_file_id: e.id, name: e.name, path: e.path, mime_type: e.mimeType,
      md5_checksum: e.md5Checksum ?? null, drive_modified_at: e.modifiedTime ?? null,
    }
    const record = async (row: Record<string, unknown>) => {
      const { error } = await db.from('kb_drive_files').upsert({ ...base, ...row }, { onConflict: 'drive_file_id' })
      if (error) throw new Error(`kb_drive_files write failed: ${error.message}`)
    }
    const outcome: FileOutcome = { driveFileId: e.id, name: e.name }

    try {
      const rule = resolveFileRule(e.name)
      if (!rule) {
        outcome.message = 'No import rule for this file name. Rename it to a known pattern (e.g. "UPCAT-Math-…", "ACET_General_Knowledge_…") or add a rule in lib/kb/fileRules.ts.'
        await record({ status: 'needs_mapping', message: outcome.message })
        summary.needsMapping.push(outcome)
        continue
      }
      if (rule.kind === 'skip') {
        outcome.message = rule.reason
        await record({ status: 'skipped', message: rule.reason })
        summary.skipped.push(outcome)
        continue
      }
      if (!isCsv(e) && e.mimeType !== SHEET_MIME) {
        outcome.message = 'Unsupported file type — save it as CSV or as a Google Sheet to import it.'
        await record({ status: 'skipped', message: outcome.message })
        summary.skipped.push(outcome)
        continue
      }
      if ((e.size ?? 0) > MAX_SHEET_BYTES) {
        outcome.message = `File is larger than ${MAX_SHEET_BYTES / 1024 / 1024} MB — split it into smaller files.`
        await record({ status: 'skipped', message: outcome.message })
        summary.skipped.push(outcome)
        continue
      }

      const text = await drive.downloadText(e)
      const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), { header: true, skipEmptyLines: 'greedy' })
      const headers = parsed.meta.fields ?? []
      const dialect = detectDialect(headers)
      if (!dialect) {
        outcome.message = `Unrecognised header row: ${headers.slice(0, 12).join(', ') || '(empty)'}`
        await record({ status: 'needs_mapping', message: outcome.message })
        summary.needsMapping.push(outcome)
        continue
      }

      const { rows, rejected } = convertRecords(rule, dialect, parsed.data, e.name)
      const missing = await attachFigures(rows, e, images, figureCache, drive, media)
      await carryOverPublished(db, rows)

      for (let c = 0; c < rows.length; c += IMPORT_CHUNK) {
        await importUpcatCore(db, rows.slice(c, c + IMPORT_CHUNK), { allowedSubtests: KB_EXTRA_SUBTESTS })
      }

      const notes = [
        rejected.length ? `${rejected.length} row(s) rejected: ${rejected.slice(0, 5).map(r => `${r.localId} (${r.reason})`).join('; ')}` : '',
        missing.length ? `${missing.length} missing figure(s): ${[...new Set(missing)].slice(0, 5).join(', ')}` : '',
      ].filter(Boolean)
      outcome.rows = rows.length
      outcome.missingMedia = missing.length
      outcome.rejected = rejected.length
      if (notes.length) outcome.message = notes.join(' · ')
      await record({
        status: 'imported',
        dialect,
        rows_total: parsed.data.length,
        rows_imported: rows.length,
        rows_missing_media: missing.length,
        rows_drafted: rows.filter(r => r.status === '').length,
        question_ids: rows.map(r => r.question_id),
        message: outcome.message ?? null,
        imported_at: new Date().toISOString(),
      })
      summary.imported.push(outcome)
    } catch (err) {
      outcome.message = err instanceof Error ? err.message : String(err)
      summary.errors.push(outcome)
      try { await record({ status: 'error', message: outcome.message }) } catch { /* keep the original error */ }
    }
  }

  return summary
}

/**
 * Resolve each row's FigureFile relative to its CSV's folder, upload it once per
 * run, and set image_url/alt/size. Rows without a figure get explicit nulls so a
 * figure removed from the sheet is cleared too. Returns the missing file names.
 */
async function attachFigures(
  rows: KbRow[],
  csv: DriveEntry,
  images: Map<string, DriveEntry>,
  cache: Map<string, { url: string; width: number | null; height: number | null }>,
  drive: DriveGateway,
  media: MediaStore,
): Promise<string[]> {
  const missing: string[] = []
  for (const row of rows) {
    row.image_url = null
    row.image_alt = row.figure_caption || null
    row.image_width = null
    row.image_height = null
    if (!row.figure_file) continue

    const img = images.get(pathKey(csv.path, row.figure_file))
    const contentType = img ? mimeForExt(img.name) : null
    if (!img || !contentType || (img.size ?? 0) > MAX_FIGURE_BYTES) {
      missing.push(row.figure_file)
      continue
    }
    let stored = cache.get(img.id)
    if (!stored) {
      const bytes = await drive.downloadBytes(img)
      if (!bytes || bytes.length === 0 || bytes.length > MAX_FIGURE_BYTES) {
        missing.push(row.figure_file)
        continue
      }
      const ext = img.name.split('.').pop()!.toLowerCase()
      const key = `${createHash('sha256').update(bytes).digest('hex')}.${ext}`
      const url = await media.upload(key, bytes, contentType)
      const size = readImageSize(bytes)
      stored = { url, width: size?.width ?? null, height: size?.height ?? null }
      cache.set(img.id, stored)
    }
    row.image_url = stored.url
    row.image_width = stored.width
    row.image_height = stored.height
  }
  return missing
}

/**
 * A changed file is re-imported whole. Questions whose content is identical to
 * what is already published stay published ('Approved' → published in
 * importUpcatCore); new or edited ones land as drafts for review.
 */
async function carryOverPublished(db: SupabaseClient, rows: KbRow[]): Promise<void> {
  const ids = rows.map(r => r.question_id)
  const live = new Map<string, { question_text: string; options: string[]; correct_index: number; image_url: string | null }>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from('upcat_questions')
      .select('question_id, question_text, options, correct_index, status, image_url')
      .in('question_id', ids.slice(i, i + 200))
    if (error) throw new Error(`upcat_questions read failed: ${error.message}`)
    for (const q of (data ?? []) as any[]) if (q.status === 'published') live.set(q.question_id, q)
  }
  if (live.size === 0) return

  for (const row of rows) {
    const cur = live.get(row.question_id)
    if (!cur) continue
    const options = [row.option_a, row.option_b, row.option_c, row.option_d].map(o => cleanImportedText(o))
    while (options.length > 0 && options[options.length - 1] === '') options.pop()
    const same =
      cleanImportedText(row.question_text) === cur.question_text &&
      JSON.stringify(options) === JSON.stringify(cur.options ?? []) &&
      LETTERS.indexOf(row.correct_answer) === cur.correct_index &&
      (row.image_url ?? null) === (cur.image_url ?? null)
    if (same) row.status = 'Approved'
  }
}
