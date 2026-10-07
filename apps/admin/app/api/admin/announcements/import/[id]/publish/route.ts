import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { errorMessage } from '@/lib/errorMessage'
import { isUuid } from '@/lib/isUuid'
import type { AnnouncementBatch } from '@/lib/announcements/types'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_EXCLUDE = 500

/**
 * Publishes an announcements preview (from the Drive sync) to admissions_updates,
 * which the app's News feed syncs. Body: { excludeIds?: string[] } — rows the
 * admin left out. New and updated rows are upserted on id with updated_at = now
 * (the app pulls rows by updated_at); unchanged rows are not touched.
 *
 * verified: an admin has reviewed the rows, so they publish verified — except
 * Social Media Findings, which are sent without the column: a new one stays
 * unverified (the default), and one an admin already verified by hand stays so.
 *
 * Idempotent: the rows are written first (a repeated upsert is harmless), then
 * the batch moves to published only if it is still in preview.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if ('error' in gate && gate.error) return gate.error

  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid preview id' }, { status: 400 })

  let body: { excludeIds?: unknown } | null = null
  try { body = await req.json() } catch { /* body is optional */ }
  const rawExclude = body?.excludeIds ?? []
  if (!Array.isArray(rawExclude) || rawExclude.length > MAX_EXCLUDE || !rawExclude.every(x => typeof x === 'string')) {
    return NextResponse.json({ error: 'excludeIds must be a list of row ids' }, { status: 400 })
  }
  const exclude = new Set(rawExclude as string[])

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

    const toPublish = batch.rows.filter(r => r.action !== 'unchanged' && !exclude.has(r.id))
    const excluded = batch.rows.filter(r => r.action !== 'unchanged' && exclude.has(r.id)).length
    if (toPublish.length === 0) {
      return NextResponse.json({ error: 'Nothing left to publish — discard the preview instead.' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const verified = toPublish.filter(r => r.update.verified).map(r => ({ ...r.update, verified: true, updated_at: now }))
    const social = toPublish.filter(r => !r.update.verified).map(r => {
      const { verified: _unverified, ...rest } = r.update
      return { ...rest, updated_at: now }
    })
    for (const rows of [verified, social]) {
      if (rows.length === 0) continue
      const { error } = await db.from('admissions_updates').upsert(rows, { onConflict: 'id' })
      if (error) throw new Error(`admissions_updates write failed: ${error.message}`)
    }

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

    revalidatePath('/admin/updates')
    revalidatePath('/admin/sync')
    return NextResponse.json({ published: toPublish.length, excluded })
  } catch (err) {
    console.error('[admin/announcements/import/[id]/publish POST] failed:', err)
    return NextResponse.json({ error: errorMessage(err, 'Publish failed') }, { status: 500 })
  }
}
