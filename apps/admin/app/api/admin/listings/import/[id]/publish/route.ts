import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { createServerClient, SHEET_OWNED_FIELDS } from '@iskotify/utils'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { errorMessage } from '@/lib/errorMessage'
import type { ImportBatch } from '@/lib/listings/types'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Publishes a preview batch: upserts NEW rows in full, patches only the
 * sheet-owned fields on UPDATE rows (never the admin-owned scholarship
 * fields), optionally closes the listings the sheet no longer mentions, logs
 * one `sync_logs` row (read by the listings health badge), and moves the
 * batch to `published`.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if ('error' in gate && gate.error) return gate.error

  const { id } = await params
  let body: { closeMissing?: unknown } | null = null
  try { body = await req.json() } catch { /* body is optional */ }
  const closeMissing = body?.closeMissing === true

  const db = createServerClient()
  try {
    const { data: batchRow, error: fetchError } = await db
      .from('listing_import_batches')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (fetchError) throw fetchError
    if (!batchRow) return NextResponse.json({ error: 'Import batch not found' }, { status: 404 })

    const batch = batchRow as ImportBatch
    if (batch.status !== 'preview') {
      return NextResponse.json({ error: `This batch is already ${batch.status}.` }, { status: 409 })
    }

    const now = new Date().toISOString()
    const plannedNew = batch.rows.filter(r => r.action === 'new')
    // The plan was made when the preview loaded. A "new" slug someone has
    // created since must be patched like an update, never overwritten whole
    // (that would reset its admin-owned scholarship fields).
    let existingSlugs = new Set<string>()
    if (plannedNew.length > 0) {
      const { data: existing, error } = await db
        .from('listings')
        .select('slug')
        .in('slug', plannedNew.map(r => r.slug))
      if (error) throw error
      existingSlugs = new Set(((existing ?? []) as { slug?: string }[]).map(r => r.slug).filter((s): s is string => !!s))
    }
    const newRows = plannedNew.filter(r => !existingSlugs.has(r.slug))
    const updateRows = [
      ...batch.rows.filter(r => r.action === 'update'),
      ...plannedNew.filter(r => existingSlugs.has(r.slug)),
    ]

    if (newRows.length > 0) {
      const { error } = await db
        .from('listings')
        .upsert(newRows.map(r => ({ ...r.listing, updated_at: now })), { onConflict: 'slug' })
      if (error) throw error
    }

    for (const row of updateRows) {
      // Only the sheet-owned fields — never the Epic B scholarship-typed
      // fields (province, is_verified, income_ceiling, …), which are
      // admin-owned and must survive a re-sync untouched.
      const patch: Record<string, unknown> = { updated_at: now }
      for (const field of SHEET_OWNED_FIELDS) patch[field] = row.listing[field]
      const { error } = await db.from('listings').update(patch).eq('slug', row.slug)
      if (error) throw error
    }

    let closedCount = 0
    if (closeMissing && batch.missing.length > 0) {
      const slugs = batch.missing.map(m => m.slug)
      const { data: closedRows, error } = await db
        .from('listings')
        .update({ status: 'closed', updated_at: now })
        .in('slug', slugs)
        .select('id')
      if (error) throw error
      closedCount = closedRows?.length ?? slugs.length
    }

    const synced = newRows.length + updateRows.length
    const skipped = batch.invalid_count
    await db.from('sync_logs').insert({
      synced,
      skipped,
      closed: closedCount,
      status: skipped > 0 ? 'warn' : 'ok',
      message: `Sheet "${batch.sheet_title ?? batch.sheet_id}"`,
    })

    const { data: updatedBatch, error: updateBatchError } = await db
      .from('listing_import_batches')
      .update({ status: 'published', published_at: now, published_by: gate.userId, closed_count: closedCount })
      .eq('id', id)
      .select()
      .single()
    if (updateBatchError) throw updateBatchError

    revalidateTag('listings')
    revalidatePath('/admin/listings')

    return NextResponse.json({
      new: newRows.length,
      update: updateRows.length,
      unchanged: batch.unchanged_count,
      invalid: batch.invalid_count,
      closed: closedCount,
      batch: updatedBatch,
    })
  } catch (err) {
    console.error('[admin/listings/import/[id]/publish POST] failed:', err)
    return NextResponse.json({ error: errorMessage(err, 'Publish failed') }, { status: 500 })
  }
}
