import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type Listing } from '@iskotify/utils'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { parseSheetLink } from '@/lib/listings/sheetLink'
import { readSheet } from '@/lib/listings/readSheet'
import { planImport } from '@/lib/listings/planImport'
import { errorMessage } from '@/lib/errorMessage'
import { EXISTING_LISTING_COLUMNS, HISTORY_COLUMNS, lastSheetUrl, type ImportBatch, type ImportBatchSummary } from '@/lib/listings/types'

export const runtime = 'nodejs'
export const maxDuration = 60

// Pastes a Google Sheets link, reads it, and stores the result as a `preview`
// batch. Only one pasted-link preview may be live at a time — an existing one
// is discarded. The Drive sync's per-file previews (drive_file_id set) are its
// own and are left alone.
export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate && gate.error) return gate.error

  let body: { url?: unknown } | null = null
  try { body = await req.json() } catch { /* handled below */ }
  const rawUrl = typeof body?.url === 'string' ? body.url.trim() : ''
  const link = rawUrl ? parseSheetLink(rawUrl) : null
  if (!link) {
    return NextResponse.json({ error: 'Enter a valid Google Sheets link.' }, { status: 400 })
  }

  let sheet: Awaited<ReturnType<typeof readSheet>>
  try {
    sheet = await readSheet(link)
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err, 'Could not read the sheet') }, { status: 502 })
  }

  const db = createServerClient()
  try {
    const { data: existingRows, error: listingsError } = await db
      .from('listings')
      .select(EXISTING_LISTING_COLUMNS)
    if (listingsError) throw listingsError

    const plan = await planImport(
      { headers: sheet.headers, records: sheet.records },
      (existingRows ?? []) as unknown as Listing[],
    )

    const { error: discardError } = await db
      .from('listing_import_batches')
      .update({ status: 'discarded', discarded_at: new Date().toISOString() })
      .eq('status', 'preview')
      .is('drive_file_id', null)
    if (discardError) throw discardError

    const { data: inserted, error: insertError } = await db
      .from('listing_import_batches')
      .insert({
        sheet_id: link.sheetId,
        sheet_url: rawUrl,
        sheet_title: sheet.title,
        tab: sheet.tab,
        status: 'preview',
        source: 'sheet_link',
        rows: plan.rows,
        invalid: plan.invalid,
        missing: plan.missing,
        column_map: plan.columnMap,
        mapped_by_ai: plan.mappedByAi,
        new_count: plan.counts.new,
        update_count: plan.counts.update,
        unchanged_count: plan.counts.unchanged,
        invalid_count: plan.counts.invalid,
        closed_count: 0,
        created_by: gate.userId,
      })
      .select()
      .single()
    if (insertError) throw insertError

    return NextResponse.json(inserted as ImportBatch)
  } catch (err) {
    console.error('[admin/listings/import POST] failed:', err)
    return NextResponse.json({ error: errorMessage(err, 'Import failed') }, { status: 500 })
  }
}

// The current preview (if any), recent history, and a URL to prefill the form with.
export async function GET() {
  const gate = await requireAdmin()
  if ('error' in gate && gate.error) return gate.error

  const db = createServerClient()
  try {
    const [previewRes, historyRes] = await Promise.all([
      db.from('listing_import_batches').select('*').eq('status', 'preview').is('drive_file_id', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      db.from('listing_import_batches').select(HISTORY_COLUMNS).in('status', ['published', 'discarded']).order('created_at', { ascending: false }).limit(50),
    ])
    if (previewRes.error) throw previewRes.error
    if (historyRes.error) throw historyRes.error

    const preview = (previewRes.data ?? null) as ImportBatch | null
    const history = (historyRes.data ?? []) as unknown as ImportBatchSummary[]
    const lastUrl = lastSheetUrl(preview, history)

    return NextResponse.json({ preview, history, lastUrl })
  } catch (err) {
    console.error('[admin/listings/import GET] failed:', err)
    return NextResponse.json({ error: errorMessage(err, 'Could not load import status') }, { status: 500 })
  }
}
