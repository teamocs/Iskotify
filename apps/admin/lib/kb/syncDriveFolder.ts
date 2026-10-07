// Google Drive → question bank sync. Lists the knowledge-base folder, and for
// every new or changed question file: reads it (CSV, native Google Sheet or
// .xlsx), works out how to read its columns, attaches its figures (uploaded
// once to the question-media bucket, content-addressed), and upserts it through
// importUpcatCore as drafts. kb_drive_files is the ledger that makes re-runs
// incremental and lets a run that hits the time budget resume next time.
//
// How a file's columns and pool are read, in order: a saved mapping
// (kb_file_mappings — an admin's, or an earlier AI one), then the file-name
// rule plus a known header dialect, then an AI mapping (Gemini, validated, and
// only kept when it yields usable questions). Nothing goes live here: every
// imported question is a draft until an admin publishes the file from Preview.
//
// Drive and Storage are injected (DriveGateway / MediaStore), and so is the
// model (AskModel), so the whole flow is testable without network; the real
// adapters live in driveClient.ts and lib/ai/mapColumns.ts.

import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { importUpcatCore } from '../upcat/importUpcatCore'
import { cleanImportedText } from '../csv/cleaners'
import { askGemini, suggestColumnMap, type AskModel } from '../ai/mapColumns'
import { resolveFileRule, fileKeyOf, KB_EXTRA_SUBTESTS } from './fileRules'
import { detectDialect, convertRecords, type KbRow, type RejectedRow } from './dialects'
import { convertMapped, kbMappingSpec, mappingFromAi, type KbMapping } from './mapping'
import { tableFromCsv, tableFromXlsx, type Table } from './table'
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
  /** With a deadline, stops (throws) instead of starting another page past it. */
  listTree(rootId: string, opts?: { deadline?: number }): Promise<DriveEntry[]>
  /** With maxBytes, stops reading past the cap and throws FileTooLargeError (./fileTooLarge). */
  downloadText(entry: DriveEntry, opts?: { maxBytes?: number }): Promise<string>
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
  /** Cap on a question file's downloaded size (default 10 MB). */
  maxSheetBytes?: number
  /** Only these Drive files, whether or not they changed (a re-sync after a mapping edit). */
  onlyFileIds?: string[]
  /** The model used to map unfamiliar files (default Gemini; null without an API key). */
  ask?: AskModel
  /** AI mappings attempted per run (default 6), so a bad batch can't burn the quota. */
  maxAiCalls?: number
}

export interface MissingFigure {
  question_id: string
  file: string
  caption: string
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
  /** Files read through a new AI mapping this run. */
  aiMapped: number
}

const SHEET_MIME = 'application/vnd.google-apps.spreadsheet'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const MAX_SHEET_BYTES = 10 * 1024 * 1024
const MAX_FIGURE_BYTES = 5 * 1024 * 1024 // question-media bucket limit
const IMPORT_CHUNK = 1000
const MAX_AI_CALLS = 6
const KEEP_REJECTED = 50
const SAMPLE_ROWS = 3
const LETTERS = ['A', 'B', 'C', 'D']

interface LedgerRow {
  drive_file_id: string
  md5_checksum: string | null
  drive_modified_at: string | null
  status: string
  imported_at?: string | null
  rows_missing_media?: number | null
  figures_fingerprint?: string | null
}

interface MappingRow {
  drive_file_id: string
  subtest: string
  main_subject: string
  skill_category: string
  columns: KbMapping['columns']
  source: KbMapping['source']
  updated_at: string
}

const formatMb = (bytes: number) => `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`
const isImage = (e: DriveEntry) => e.mimeType.startsWith('image/')
const isCsv = (e: DriveEntry) => e.mimeType === 'text/csv' || /\.csv$/i.test(e.name)
const isXlsx = (e: DriveEntry) => e.mimeType === XLSX_MIME || /\.xlsx$/i.test(e.name)
const isReadable = (e: DriveEntry) => isCsv(e) || isXlsx(e) || e.mimeType === SHEET_MIME

function unsupportedMessage(e: DriveEntry): string {
  if (/\.(docx?|pdf)$/i.test(e.name) || /wordprocessing|msword|pdf/.test(e.mimeType)) {
    return 'Word and PDF files can’t be imported — put the questions in a CSV, Excel file or Google Sheet, one row per question. Questions whose answer choices are pictures aren’t supported yet.'
  }
  if (/\.xls$/i.test(e.name)) return 'Old .xls workbooks can’t be read — save it as .xlsx, CSV or a Google Sheet.'
  return 'Unsupported file type — save it as a CSV, Excel (.xlsx) file or Google Sheet to import it.'
}

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

/** Changes whenever an image is added, removed or replaced anywhere under the root. */
function figuresFingerprint(images: DriveEntry[]): string {
  const parts = images.map(e => `${pathKey(e.path, e.name)}:${e.md5Checksum ?? e.modifiedTime ?? ''}`).sort()
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 32)
}

function sameContent(e: DriveEntry, led: LedgerRow): boolean {
  if (e.md5Checksum) return led.md5_checksum === e.md5Checksum
  // Native Google Sheets have no md5 — fall back to the modified time.
  return !!e.modifiedTime && !!led.drive_modified_at &&
    Date.parse(led.drive_modified_at) === Date.parse(e.modifiedTime)
}

/** Whether a listed file needs (re)processing this run. */
function needsWork(e: DriveEntry, led: LedgerRow | undefined, mapping: MappingRow | undefined, fingerprint: string): boolean {
  if (!led) return true
  // Retried every run: an AI or admin mapping, or a rename, may fix them.
  if (led.status === 'error' || led.status === 'needs_mapping') return true
  // Skipped as unreadable earlier, readable now (e.g. .xlsx support).
  if (led.status === 'skipped' && isReadable(e) && resolveFileRule(e.name)?.kind !== 'skip') return true
  if (mapping && (!led.imported_at || Date.parse(mapping.updated_at) > Date.parse(led.imported_at))) return true
  if (led.status === 'imported' && (led.rows_missing_media ?? 0) > 0 && led.figures_fingerprint !== fingerprint) return true
  return !sameContent(e, led)
}

export async function syncDriveFolder(
  db: SupabaseClient,
  drive: DriveGateway,
  media: MediaStore,
  opts: SyncOptions,
): Promise<SyncSummary> {
  const now = opts.now ?? Date.now
  const maxSheetBytes = opts.maxSheetBytes ?? MAX_SHEET_BYTES
  const ask = opts.ask ?? askGemini
  let aiCallsLeft = opts.maxAiCalls ?? MAX_AI_CALLS
  const summary: SyncSummary = { imported: [], skipped: [], needsMapping: [], errors: [], unchanged: 0, remaining: 0, aiMapped: 0 }

  const entries = await drive.listTree(opts.rootId)
  const imageEntries = entries.filter(isImage)
  const images = new Map(imageEntries.map(e => [pathKey(e.path, e.name), e]))
  const fingerprint = figuresFingerprint(imageEntries)
  const candidates = entries.filter(e => !isImage(e) && e.mimeType !== FOLDER_MIME)

  const [{ data: ledgerData, error: ledgerErr }, { data: mappingData, error: mappingErr }] = await Promise.all([
    db.from('kb_drive_files').select('drive_file_id, md5_checksum, drive_modified_at, status, imported_at, rows_missing_media, figures_fingerprint'),
    db.from('kb_file_mappings').select('drive_file_id, subtest, main_subject, skill_category, columns, source, updated_at'),
  ])
  if (ledgerErr) throw new Error(`kb_drive_files read failed: ${ledgerErr.message}`)
  if (mappingErr) throw new Error(`kb_file_mappings read failed: ${mappingErr.message}`)
  const ledger = new Map(((ledgerData ?? []) as LedgerRow[]).map(r => [r.drive_file_id, r]))
  const mappings = new Map(((mappingData ?? []) as MappingRow[]).map(r => [r.drive_file_id, r]))

  // Question ids are namespaced by file name, so two importable files with the
  // same name would overwrite each other's questions. Hold both until one is
  // renamed. Files that can't be imported anyway don't count.
  const byKey = new Map<string, DriveEntry[]>()
  for (const e of candidates) {
    if (!isReadable(e) || resolveFileRule(e.name)?.kind === 'skip') continue
    const k = fileKeyOf(e.name)
    byKey.set(k, [...(byKey.get(k) ?? []), e])
  }

  const only = opts.onlyFileIds ? new Set(opts.onlyFileIds) : null
  // A retry of an unchanged file still stuck in needs_mapping goes last, so
  // stuck files can't use up the run's AI budget (or time) before new and
  // changed files get theirs, run after run.
  const isStuckRetry = (e: DriveEntry) => {
    const led = ledger.get(e.id)
    return !!led && led.status === 'needs_mapping' && sameContent(e, led) && !mappings.has(e.id)
  }
  const todo = candidates
    .filter(e => {
      if (only) return only.has(e.id)
      if (!needsWork(e, ledger.get(e.id), mappings.get(e.id), fingerprint)) { summary.unchanged++; return false }
      return true
    })
    .sort((a, b) => Number(isStuckRetry(a)) - Number(isStuckRetry(b)))

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
    const hold = async (message: string, table?: Table) => {
      outcome.message = message
      await record({
        status: 'needs_mapping',
        message,
        ...(table ? { headers: table.headers, sample_rows: table.records.slice(0, SAMPLE_ROWS) } : {}),
      })
      summary.needsMapping.push(outcome)
    }
    const skip = async (message: string) => {
      outcome.message = message
      await record({ status: 'skipped', message })
      summary.skipped.push(outcome)
    }

    try {
      const rule = resolveFileRule(e.name)
      if (rule?.kind === 'skip') { await skip(rule.reason); continue }
      if (!isReadable(e)) { await skip(unsupportedMessage(e)); continue }
      const twins = (byKey.get(fileKeyOf(e.name)) ?? []).filter(o => o.id !== e.id)
      if (twins.length > 0) {
        await hold(`Another file has the same name (${twins.map(o => `${o.path}/${o.name}`).join(', ')}); their question ids would collide. Rename or remove one.`)
        continue
      }
      const tooLarge = () => skip(`File is larger than ${formatMb(maxSheetBytes)} — split it into smaller files.`)
      if ((e.size ?? 0) > maxSheetBytes) { await tooLarge(); continue }

      let table: Table
      if (isXlsx(e)) {
        table = await tableFromXlsx(await drive.downloadBytes(e))
      } else {
        const text = await drive.downloadText(e)
        // Native Google Sheets report no size in the listing, so check the export too.
        if (Buffer.byteLength(text, 'utf8') > maxSheetBytes) { await tooLarge(); continue }
        table = tableFromCsv(text)
      }

      // How to read this file: saved mapping → rule + known dialect → AI.
      let converted: { rows: KbRow[]; rejected: RejectedRow[] }
      let dialect: string = 'mapped'
      let mappingSource: 'rule' | 'ai' | 'admin' = 'rule'
      let newAiMapping: KbMapping | null = null
      const saved = mappings.get(e.id)
      const known = detectDialect(table.headers)

      if (saved) {
        mappingSource = saved.source
        converted = convertMapped(
          { subtest: saved.subtest, mainSubject: saved.main_subject, skillCategory: saved.skill_category, columns: saved.columns, source: saved.source },
          table.records, e.name,
        )
      } else if (rule && known) {
        dialect = known
        converted = convertRecords(rule, known, table.records, e.name)
      } else {
        const why = rule ? 'Its columns don’t match a known layout' : 'No import rule matches this file name'
        if (table.records.length === 0) { await hold(`${why}, and the file has no data rows.`, table); continue }
        if (aiCallsLeft <= 0) { await hold(`${why}. AI mapping will be tried on the next sync, or map the columns yourself.`, table); continue }
        aiCallsLeft--
        const ai = await suggestColumnMap(kbMappingSpec(e.name, table, !rule), ask)
        if (!ai) { await hold(`${why}, and AI mapping couldn’t work it out. Map the columns yourself.`, table); continue }
        newAiMapping = mappingFromAi(ai, rule ? { subtest: rule.subtest, mainSubject: rule.mainSubject } : null)
        mappingSource = 'ai'
        converted = convertMapped(newAiMapping, table.records, e.name)
        // A mapping that reads nothing, or rejects most rows, is wrong — don't keep it.
        if (converted.rows.length === 0 || converted.rejected.length > converted.rows.length) {
          const reasons = [...new Set(converted.rejected.map(r => r.reason))].slice(0, 3).join(', ')
          await hold(`${why}, and the AI mapping didn’t produce usable questions (${converted.rejected.length} rows rejected: ${reasons}). Map the columns yourself.`, table)
          continue
        }
      }

      const { rows, rejected } = converted
      const missing = await attachFigures(rows, e, images, figureCache, drive, media)
      const redrafted = await carryOverPublished(db, rows)

      for (let c = 0; c < rows.length; c += IMPORT_CHUNK) {
        await importUpcatCore(db, rows.slice(c, c + IMPORT_CHUNK), { allowedSubtests: KB_EXTRA_SUBTESTS })
      }
      if (redrafted > 0) {
        // Pull the flashcard copies of the re-drafted questions out of the quiz too.
        const { error } = await db.rpc('project_question_bank_to_flashcards')
        if (error) throw new Error(`flashcard projection failed: ${error.message}`)
      }

      const notes = [
        newAiMapping ? 'Columns mapped by AI — check the preview before publishing' : '',
        redrafted ? `${redrafted} live question(s) changed in the sheet and went back to draft — review and publish again` : '',
        rejected.length ? `${rejected.length} row(s) rejected: ${rejected.slice(0, 5).map(r => `${r.localId} (${r.reason})`).join('; ')}` : '',
        missing.length ? `${missing.length} missing figure(s): ${[...new Set(missing.map(m => m.file))].slice(0, 5).join(', ')}` : '',
      ].filter(Boolean)
      outcome.rows = rows.length
      outcome.missingMedia = missing.length
      outcome.rejected = rejected.length
      if (notes.length) outcome.message = notes.join(' · ')

      const drafted = rows.filter(r => r.status === '').length
      const importedAt = new Date().toISOString()
      await record({
        status: 'imported',
        dialect,
        mapping_source: mappingSource,
        headers: table.headers,
        sample_rows: table.records.slice(0, SAMPLE_ROWS),
        rows_total: table.records.length,
        rows_imported: rows.length,
        rows_missing_media: missing.length,
        missing_figures: missing,
        rows_drafted: drafted,
        rows_rejected: rejected.length,
        rejected_rows: rejected.slice(0, KEEP_REJECTED),
        question_ids: rows.map(r => r.question_id),
        figures_fingerprint: fingerprint,
        message: outcome.message ?? null,
        imported_at: importedAt,
        // Nothing new to review (every row matches what is live): straight to history.
        ...(drafted === 0 ? { published_at: importedAt } : {}),
      })
      if (newAiMapping) {
        const { error } = await db.from('kb_file_mappings').upsert({
          drive_file_id: e.id,
          subtest: newAiMapping.subtest,
          main_subject: newAiMapping.mainSubject,
          skill_category: newAiMapping.skillCategory,
          columns: newAiMapping.columns,
          source: 'ai',
          updated_at: importedAt,
        }, { onConflict: 'drive_file_id' })
        if (error) throw new Error(`kb_file_mappings write failed: ${error.message}`)
        summary.aiMapped++
      }
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
 * figure removed from the sheet is cleared too. Returns every question whose
 * figure is missing, with the file it expects and its caption.
 */
async function attachFigures(
  rows: KbRow[],
  csv: DriveEntry,
  images: Map<string, DriveEntry>,
  cache: Map<string, { url: string; width: number | null; height: number | null }>,
  drive: DriveGateway,
  media: MediaStore,
): Promise<MissingFigure[]> {
  const missing: MissingFigure[] = []
  for (const row of rows) {
    row.image_url = null
    row.image_alt = row.figure_caption || null
    row.image_width = null
    row.image_height = null
    if (!row.figure_file) continue

    const img = images.get(pathKey(csv.path, row.figure_file))
    const contentType = img ? mimeForExt(img.name) : null
    if (!img || !contentType || (img.size ?? 0) > MAX_FIGURE_BYTES) {
      missing.push({ question_id: row.question_id, file: row.figure_file, caption: row.figure_caption })
      continue
    }
    let stored = cache.get(img.id)
    if (!stored) {
      const bytes = await drive.downloadBytes(img)
      if (!bytes || bytes.length === 0 || bytes.length > MAX_FIGURE_BYTES) {
        missing.push({ question_id: row.question_id, file: row.figure_file, caption: row.figure_caption })
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
 * importUpcatCore); new or edited ones land as drafts for review. Returns how
 * many live questions an edit sends back to draft.
 */
async function carryOverPublished(db: SupabaseClient, rows: KbRow[]): Promise<number> {
  const ids = rows.map(r => r.question_id)
  const live = new Map<string, { question_text: string; options: string[]; correct_index: number; image_url: string | null }>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db
      .from('upcat_questions')
      .select('question_id, question_text, options, correct_index, status, image_url')
      .in('question_id', ids.slice(i, i + 200))
    if (error) throw new Error(`upcat_questions read failed: ${error.message}`)
    type LiveRow = { question_id: string; question_text: string; options: string[]; correct_index: number; status: string; image_url: string | null }
    for (const q of (data ?? []) as LiveRow[]) if (q.status === 'published') live.set(q.question_id, q)
  }
  if (live.size === 0) return 0

  let redrafted = 0
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
    else redrafted++
  }
  return redrafted
}
