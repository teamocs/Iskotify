import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { errorMessage } from '@/lib/errorMessage'
import { isUuid } from '@/lib/isUuid'
import { severityOf, verifiedOf } from '@/lib/announcements/extract'
import { toSourceLinks } from '@/lib/announcements/sources'
import type { AnnouncementBatch, AnnouncementRow } from '@/lib/announcements/types'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_IDS = 500

function idList(v: unknown): string[] | null {
  if (v === undefined || v === null) return []
  return Array.isArray(v) && v.length <= MAX_IDS && v.every(x => typeof x === 'string') ? (v as string[]) : null
}

/** The admissions_updates row to write: severity/verified from the section, sources as safe links. */
function rowToWrite(r: AnnouncementRow, now: string) {
  const { verified: _stored, ...rest } = r.update
  const base = { ...rest, severity: severityOf(r.section), sources: toSourceLinks(r.update.sources), updated_at: now }
  // Social findings are sent without `verified`: a new one stays unverified
  // (the default) and one an admin verified by hand stays verified.
  return verifiedOf(r.section) ? { ...base, verified: true } : base
}

/**
 * Publishes an announcements preview (from the Drive sync) to admissions_updates,
 * which the app's News feed syncs. Body (all optional):
 *   excludeIds — rows the admin left out;
 *   confirmIds — flagged rows (title/summary not backed by the report) the
 *                admin ticked; a flagged row is never published without it.
 *
 * Severity and verified come from the row's report section (set from the Doc's
 * headings at extraction), never from the stored values. A live row changed
 * since the preview was made (updated_at newer than the batch) is not
 * overwritten: it is skipped and reported.
 *
 * Order: the batch is claimed first (preview → published, only if still in
 * preview), then the rows are upserted on id; if that write fails the batch
 * goes back to preview and the error is returned.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if ('error' in gate && gate.error) return gate.error

  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid preview id' }, { status: 400 })

  let body: { excludeIds?: unknown; confirmIds?: unknown } | null = null
  try { body = await req.json() } catch { /* body is optional */ }
  const excludeList = idList(body?.excludeIds)
  const confirmList = idList(body?.confirmIds)
  if (!excludeList || !confirmList) {
    return NextResponse.json({ error: 'excludeIds and confirmIds must be lists of row ids' }, { status: 400 })
  }
  const exclude = new Set(excludeList)
  const confirm = new Set(confirmList)

  const db = gate.supabase!
  try {
    const { data: batchRow, error: fetchError } = await db
      .from('announcement_import_batches')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (fetchError) throw new Error(fetchError.message)
    if (!batchRow) return NextResponse.json({ error: 'Preview not found' }, { status: 404 })
    const batch = batchRow as AnnouncementBatch
    if (batch.status !== 'preview') {
      return NextResponse.json({ error: `This preview is already ${batch.status}.` }, { status: 409 })
    }

    const changed = batch.rows.filter(r => r.action !== 'unchanged')
    const excluded = changed.filter(r => exclude.has(r.id)).length
    const unconfirmed = changed.filter(r => !exclude.has(r.id) && r.warning && !confirm.has(r.id)).length
    const wanted = changed.filter(r => !exclude.has(r.id) && (!r.warning || confirm.has(r.id)))
    if (wanted.length === 0) {
      return NextResponse.json({ error: 'Nothing left to publish — discard the preview instead.' }, { status: 400 })
    }

    // Stale guard: never overwrite a live row edited after this preview was made.
    const { data: live, error: liveError } = await db
      .from('admissions_updates')
      .select('id, updated_at')
      .in('id', wanted.map(r => r.id))
    if (liveError) throw new Error(liveError.message)
    const madeAt = Date.parse(batch.created_at)
    const stale = new Set(((live ?? []) as { id: string; updated_at: string | null }[])
      .filter(r => r.updated_at && Date.parse(r.updated_at) > madeAt)
      .map(r => r.id))
    const toPublish = wanted.filter(r => !stale.has(r.id))
    const skippedStale = wanted.filter(r => stale.has(r.id)).map(r => r.id)
    if (toPublish.length === 0) {
      return NextResponse.json({ error: 'Every row changed in Admissions updates after this preview was made — sync the report again.', skippedStale }, { status: 409 })
    }

    const now = new Date().toISOString()
    const { data: claimed, error: claimError } = await db
      .from('announcement_import_batches')
      .update({ status: 'published', published_at: now, published_by: gate.userId ?? null, published_count: toPublish.length })
      .eq('id', id)
      .eq('status', 'preview')
      .select('id')
    if (claimError) throw new Error(claimError.message)
    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ error: 'This preview was already published or discarded.' }, { status: 409 })
    }

    const rows = toPublish.map(r => rowToWrite(r, now))
    const groups = [rows.filter(r => 'verified' in r), rows.filter(r => !('verified' in r))]
    try {
      for (const group of groups) {
        if (group.length === 0) continue
        const { error } = await db.from('admissions_updates').upsert(group, { onConflict: 'id' })
        if (error) throw new Error(`admissions_updates write failed: ${error.message}`)
      }
    } catch (err) {
      // Put the batch back so it can be published again (the upsert is idempotent).
      const { error: revertError } = await db
        .from('announcement_import_batches')
        .update({ status: 'preview', published_at: null, published_by: null, published_count: 0 })
        .eq('id', id)
      if (revertError) console.error('[admin/announcements/import/[id]/publish] revert failed:', revertError)
      throw err
    }

    revalidatePath('/admin/updates')
    revalidatePath('/admin/sync')
    return NextResponse.json({ published: toPublish.length, excluded, unconfirmed, skippedStale })
  } catch (err) {
    console.error('[admin/announcements/import/[id]/publish POST] failed:', err)
    return NextResponse.json({ error: errorMessage(err, 'Publish failed') }, { status: 500 })
  }
}
