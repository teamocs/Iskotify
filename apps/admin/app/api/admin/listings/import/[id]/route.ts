import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { errorMessage } from '@/lib/errorMessage'

export const runtime = 'nodejs'

// Discards a live preview batch (it moves to history as "discarded").
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if ('error' in gate && gate.error) return gate.error

  const { id } = await params
  const db = createServerClient()
  try {
    const { data: batch, error: fetchError } = await db
      .from('listing_import_batches')
      .select('status')
      .eq('id', id)
      .maybeSingle()
    if (fetchError) throw fetchError
    if (!batch) return NextResponse.json({ error: 'Import batch not found' }, { status: 404 })
    if (batch.status !== 'preview') {
      return NextResponse.json({ error: `This batch is already ${batch.status}.` }, { status: 409 })
    }

    const { error } = await db
      .from('listing_import_batches')
      .update({ status: 'discarded', discarded_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/listings/import/[id] DELETE] failed:', err)
    return NextResponse.json({ error: errorMessage(err, 'Discard failed') }, { status: 500 })
  }
}
