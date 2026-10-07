// Google Drive → listings and announcements previews. The sibling of
// lib/kb/syncDriveFolder.ts (questions): the drive-sync route lists every
// enabled drive_sources folder and hands the listings/announcements ones here.
//
//   listings       each Google Sheet / CSV / .xlsx → readable table (a title
//                  banner above the header is skipped) → planImport → a
//                  listing_import_batches preview tagged with the Drive file.
//   announcements  each Google Doc → plain text → AI extraction, validated
//                  against the text (lib/announcements/extract.ts) → an
//                  announcement_import_batches preview.
//
// Nothing goes live here: an admin publishes each preview from /admin/sync.
// drive_content_files is the per-file ledger (migration 068): an unchanged file
// (same md5, or same modifiedTime for native Google files) makes no new preview,
// a changed one replaces its file's live preview, held/error files are retried,
// and a run that reaches the deadline resumes next time. AI calls share one
// per-run budget, like the question sync's.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Listing } from '@iskotify/utils'
import type { DriveEntry, DriveGateway } from '../kb/syncDriveFolder'
import { tableFromCsv, tableFromXlsx, type Table } from '../kb/table'
import { geminiAsk, type AskModel } from '../ai/mapColumns'
import { planImport, looksLikeListingHeader } from '../listings/planImport'
import { EXISTING_LISTING_COLUMNS } from '../listings/types'
import { extractAnnouncements, diffAnnouncements } from '../announcements/extract'

export type ContentType = 'listings' | 'announcements'

export interface ContentSource {
  id: string | null
  contentType: ContentType
  folderId: string
  label: string | null
}

export type ContentStatus = 'previewed' | 'no_changes' | 'held' | 'skipped' | 'error'

export interface ContentOutcome {
  contentType: ContentType
  driveFileId: string
  name: string
  status: ContentStatus
  message?: string
  batchId?: string
}

export interface SourceError {
  sourceId: string | null
  contentType: ContentType
  folderId: string
  label: string | null
  message: string
}

export interface ContentSyncSummary {
  files: ContentOutcome[]
  /** Files skipped because nothing changed since the last run. */
  unchanged: number
  /** Files left for the next run (deadline reached). */
  remaining: number
  aiCalls: number
  sourceErrors: SourceError[]
}

export interface ContentSyncOptions {
  /** Epoch ms after which no new file is started. */
  deadline?: number
  now?: () => number
  /** The model (default Gemini with room for a full report). */
  ask?: AskModel
  /** AI calls per run across both content types (default 6). */
  maxAiCalls?: number
  /** Cap on a downloaded file (default 10 MB). */
  maxFileBytes?: number
}

const SHEET_MIME = 'application/vnd.google-apps.spreadsheet'
const DOC_MIME = 'application/vnd.google-apps.document'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_AI_CALLS = 6
// The route stops starting files 15 s before its 60 s limit; a report's model
// call can take ~30 s, so one only starts with at least this long to go.
const AI_HEADROOM_MS = 20_000
// A weekly report's findings can run long; the column-mapping default (1024) can't hold them.
const askForReports = geminiAsk({ maxOutputTokens: 8192 })

interface LedgerRow {
  content_type: ContentType
  drive_file_id: string
  md5_checksum: string | null
  drive_modified_at: string | null
  status: ContentStatus
}

const isXlsx = (e: DriveEntry) => e.mimeType === XLSX_MIME || /\.xlsx$/i.test(e.name)
const isCsv = (e: DriveEntry) => e.mimeType === 'text/csv' || /\.csv$/i.test(e.name)
const isSheetLike = (e: DriveEntry) => e.mimeType === SHEET_MIME || isCsv(e) || isXlsx(e)
const isDocLike = (e: DriveEntry) => e.mimeType === DOC_MIME || e.mimeType === 'text/plain' || /\.(txt|md)$/i.test(e.name)

/** A link an admin can open, whatever the file type. */
export const driveFileUrl = (id: string) => `https://drive.google.com/open?id=${encodeURIComponent(id)}`

const keyOf = (type: ContentType, id: string) => `${type}:${id}`

function sameContent(e: DriveEntry, led: LedgerRow): boolean {
  if (e.md5Checksum) return led.md5_checksum === e.md5Checksum
  // Native Google files have no md5 — fall back to the modified time.
  return !!e.modifiedTime && !!led.drive_modified_at && Date.parse(led.drive_modified_at) === Date.parse(e.modifiedTime)
}

function needsWork(e: DriveEntry, led: LedgerRow | undefined): boolean {
  if (!led) return true
  // Retried every run: a transient AI or Drive failure may be gone.
  if (led.status === 'error' || led.status === 'held') return true
  return !sameContent(e, led)
}

const errMessage = (err: unknown) => (err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err))

export async function syncContentSources(
  db: SupabaseClient,
  drive: DriveGateway,
  sources: ContentSource[],
  opts: ContentSyncOptions = {},
): Promise<ContentSyncSummary> {
  const now = opts.now ?? Date.now
  const maxBytes = opts.maxFileBytes ?? MAX_FILE_BYTES
  const baseAsk = opts.ask ?? askForReports
  const summary: ContentSyncSummary = { files: [], unchanged: 0, remaining: 0, aiCalls: 0, sourceErrors: [] }

  let aiLeft = opts.maxAiCalls ?? MAX_AI_CALLS
  // Every model call in the run goes through here, so the budget covers both
  // the listings column-mapping fallback and the report extraction.
  const ask: AskModel = async (prompt) => {
    if (aiLeft <= 0) return null
    aiLeft--
    summary.aiCalls++
    return baseAsk(prompt)
  }

  const { data: ledgerData, error: ledgerErr } = await db
    .from('drive_content_files')
    .select('content_type, drive_file_id, md5_checksum, drive_modified_at, status')
  if (ledgerErr) throw new Error(`drive_content_files read failed: ${ledgerErr.message}`)
  const ledger = new Map(((ledgerData ?? []) as LedgerRow[]).map(r => [keyOf(r.content_type, r.drive_file_id), r]))

  // Every file under every source; a file reachable twice for one type runs once.
  const candidates: { source: ContentSource; e: DriveEntry }[] = []
  const seen = new Set<string>()
  for (const source of sources) {
    let entries: DriveEntry[]
    try {
      entries = await drive.listTree(source.folderId)
    } catch (err) {
      summary.sourceErrors.push({ sourceId: source.id, contentType: source.contentType, folderId: source.folderId, label: source.label, message: errMessage(err) })
      continue
    }
    for (const e of entries) {
      if (e.mimeType === FOLDER_MIME || e.mimeType.startsWith('image/')) continue
      const k = keyOf(source.contentType, e.id)
      if (seen.has(k)) continue
      seen.add(k)
      candidates.push({ source, e })
    }
  }

  // A held file whose content hasn't changed goes last, so files stuck on the
  // AI can't use up the run's budget (or time) before new and changed ones.
  const isStuckRetry = ({ source, e }: { source: ContentSource; e: DriveEntry }) => {
    const led = ledger.get(keyOf(source.contentType, e.id))
    return !!led && led.status === 'held' && sameContent(e, led)
  }
  const todo = candidates
    .filter(c => {
      if (needsWork(c.e, ledger.get(keyOf(c.source.contentType, c.e.id)))) return true
      summary.unchanged++
      return false
    })
    .sort((a, b) => Number(isStuckRetry(a)) - Number(isStuckRetry(b)))

  let liveListings: Listing[] | null = null
  const getListings = async () => {
    if (liveListings) return liveListings
    const { data, error } = await db.from('listings').select(EXISTING_LISTING_COLUMNS)
    if (error) throw new Error(`listings read failed: ${error.message}`)
    liveListings = (data ?? []) as unknown as Listing[]
    return liveListings
  }

  for (let i = 0; i < todo.length; i++) {
    if (opts.deadline !== undefined && now() >= opts.deadline) {
      summary.remaining += todo.length - i
      break
    }
    const { source, e } = todo[i]!
    // A report read is one long model call: only start it with room to finish
    // inside the function's limit; otherwise it waits for the next run.
    if (source.contentType === 'announcements' && opts.deadline !== undefined && opts.deadline - now() < AI_HEADROOM_MS) {
      summary.remaining++
      continue
    }
    const outcome: ContentOutcome = { contentType: source.contentType, driveFileId: e.id, name: e.name, status: 'error' }
    const record = async (status: ContentStatus, message: string | null, batchId: string | null = null) => {
      outcome.status = status
      if (message) outcome.message = message
      if (batchId) outcome.batchId = batchId
      const { error } = await db.from('drive_content_files').upsert({
        content_type: source.contentType,
        drive_file_id: e.id,
        source_id: source.id,
        name: e.name,
        path: e.path,
        mime_type: e.mimeType,
        md5_checksum: e.md5Checksum ?? null,
        drive_modified_at: e.modifiedTime ?? null,
        status,
        message,
        batch_id: batchId,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'content_type,drive_file_id' })
      if (error) throw new Error(`drive_content_files write failed: ${error.message}`)
    }

    try {
      if ((e.size ?? 0) > maxBytes) {
        await record('skipped', `File is larger than ${Math.round(maxBytes / 1024 / 1024)} MB — split it into smaller files.`)
      } else if (source.contentType === 'listings') {
        const r = await listingsFile(db, drive, e, { ask, getListings, maxBytes })
        await record(r.status, r.message, r.batchId)
      } else {
        const r = await announcementsFile(db, drive, e, { ask, aiLeft: () => aiLeft })
        await record(r.status, r.message, r.batchId)
      }
    } catch (err) {
      outcome.message = errMessage(err)
      try { await record('error', outcome.message) } catch { /* keep the original error */ }
    }
    summary.files.push(outcome)
  }

  return summary
}

interface FileResult { status: ContentStatus; message: string | null; batchId?: string | null }

async function discardLivePreview(db: SupabaseClient, table: 'listing_import_batches' | 'announcement_import_batches', driveFileId: string) {
  const { error } = await db
    .from(table)
    .update({ status: 'discarded', discarded_at: new Date().toISOString() })
    .eq('drive_file_id', driveFileId)
    .eq('status', 'preview')
  if (error) throw new Error(`${table} update failed: ${error.message}`)
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

async function listingsFile(
  db: SupabaseClient,
  drive: DriveGateway,
  e: DriveEntry,
  ctx: { ask: AskModel; getListings: () => Promise<Listing[]>; maxBytes: number },
): Promise<FileResult> {
  if (!isSheetLike(e)) {
    return { status: 'skipped', message: 'Listings are read from Google Sheets, CSV or Excel (.xlsx) files — put this one in another folder, or save it as a sheet.' }
  }
  const hint = { isHeader: looksLikeListingHeader }
  let table: Table
  if (isXlsx(e)) {
    table = await tableFromXlsx(await drive.downloadBytes(e), hint)
  } else {
    const text = await drive.downloadText(e)
    if (Buffer.byteLength(text, 'utf8') > ctx.maxBytes) {
      return { status: 'skipped', message: `File is larger than ${Math.round(ctx.maxBytes / 1024 / 1024)} MB — split it into smaller files.` }
    }
    table = tableFromCsv(text, hint)
  }
  if (table.records.length === 0) return { status: 'held', message: 'The sheet has no data rows under its header.' }

  const plan = await planImport(table, await ctx.getListings(), { ask: ctx.ask })
  if (plan.rows.length === 0) {
    const why = plan.invalid.slice(0, 3).map(r => `row ${r.row}: ${r.errors.join(', ')}`).join('; ')
    return {
      status: 'held',
      message: `No listings could be read — the sheet needs "type" and "title" columns${why ? ` (${why})` : ''}.`,
    }
  }

  // The file changed: its earlier preview is stale either way.
  await discardLivePreview(db, 'listing_import_batches', e.id)
  const changed = plan.counts.new + plan.counts.update
  const invalidNote = plan.counts.invalid ? ` · ${plural(plan.counts.invalid, 'row')} couldn’t be read` : ''
  if (changed === 0) {
    return { status: 'no_changes', message: `All ${plural(plan.counts.unchanged, 'listing')} already match what is live${invalidNote}.` }
  }

  const { data, error } = await db
    .from('listing_import_batches')
    .insert({
      sheet_id: e.id,
      sheet_url: driveFileUrl(e.id),
      sheet_title: e.name,
      tab: null,
      status: 'preview',
      source: 'drive',
      drive_file_id: e.id,
      rows: plan.rows,
      invalid: plan.invalid,
      // A Drive file may hold only some listings, so it never proposes closing
      // the ones it doesn't mention.
      missing: [],
      column_map: plan.columnMap,
      mapped_by_ai: plan.mappedByAi,
      new_count: plan.counts.new,
      update_count: plan.counts.update,
      unchanged_count: plan.counts.unchanged,
      invalid_count: plan.counts.invalid,
      closed_count: 0,
      created_by: null,
    })
    .select('id')
    .single()
  if (error) throw new Error(`listing_import_batches insert failed: ${error.message}`)
  return {
    status: 'previewed',
    message: `${plan.counts.new} new · ${plan.counts.update} updated${invalidNote}${plan.mappedByAi ? ' · columns mapped by AI' : ''}`,
    batchId: String((data as { id: string | number }).id),
  }
}

async function announcementsFile(
  db: SupabaseClient,
  drive: DriveGateway,
  e: DriveEntry,
  ctx: { ask: AskModel; aiLeft: () => number },
): Promise<FileResult> {
  if (!isDocLike(e)) {
    return { status: 'skipped', message: 'Announcements are read from Google Docs — save the report as a Google Doc (File → Save as Google Docs).' }
  }
  if (ctx.aiLeft() <= 0) {
    return { status: 'held', message: 'This run’s AI budget is spent; the report will be read on the next sync.' }
  }
  const text = await drive.downloadText(e)
  const result = await extractAnnouncements({ text, fileName: e.name, modifiedTime: e.modifiedTime }, ctx.ask)
  if (!result.ok) return { status: 'held', message: result.message }

  const { data: live, error: liveErr } = await db
    .from('admissions_updates')
    .select('id, report_date, severity, school_name, title, body, action_required, event_date, event_type, sources')
    .in('id', result.items.map(i => i.id))
  if (liveErr) throw new Error(`admissions_updates read failed: ${liveErr.message}`)
  const rows = diffAnnouncements(result.items, (live ?? []) as Parameters<typeof diffAnnouncements>[1])
  const counts = {
    new: rows.filter(r => r.action === 'new').length,
    update: rows.filter(r => r.action === 'update').length,
    unchanged: rows.filter(r => r.action === 'unchanged').length,
  }

  await discardLivePreview(db, 'announcement_import_batches', e.id)
  const skippedNote = result.skipped.length ? ` · ${plural(result.skipped.length, 'item')} left out` : ''
  if (counts.new + counts.update === 0) {
    return { status: 'no_changes', message: `All ${plural(counts.unchanged, 'announcement')} already match what is live${skippedNote}.` }
  }

  const { data, error } = await db
    .from('announcement_import_batches')
    .insert({
      drive_file_id: e.id,
      file_name: e.name,
      report_date: result.reportDate,
      status: 'preview',
      rows,
      skipped: result.skipped,
      new_count: counts.new,
      update_count: counts.update,
      unchanged_count: counts.unchanged,
      skipped_count: result.skipped.length,
    })
    .select('id')
    .single()
  if (error) throw new Error(`announcement_import_batches insert failed: ${error.message}`)
  return {
    status: 'previewed',
    message: `${counts.new} new · ${counts.update} updated${skippedNote}`,
    batchId: String((data as { id: string | number }).id),
  }
}
