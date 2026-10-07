import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { errorMessage } from '@/lib/errorMessage'
import { isUuid } from '@/lib/isUuid'

export const runtime = 'nodejs'

// Discards an announcements preview from the Drive sync (it moves to history
// as "discarded"; nothing is published). The same file makes a new preview
// only when it changes in Drive.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if ('error' in gate && gate.error) return gate.error

  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid preview id' }, { status: 400 })
  const db = gate.supabase!
  try {
    const { data: batch, error: fetchError } = await db
      .from('announcement_import_batches')
      .select('status')
      .eq('id', id)
      .maybeSingle()
    if (fetchError) throw new Error(fetchError.message)
    if (!batch) return NextResponse.json({ error: 'Preview not found' }, { status: 404 })
    if (batch.status !== 'preview') {
      return NextResponse.json({ error: `This preview is already ${batch.status}.` }, { status: 409 })
    }

    const { data, error } = await db
      .from('announcement_import_batches')
      .update({ status: 'discarded', discarded_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'preview')
      .select('id')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) return NextResponse.json({ error: 'This preview was already published or discarded.' }, { status: 409 })

    revalidatePath('/admin/sync')
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/announcements/import/[id] DELETE] failed:', err)
    return NextResponse.json({ error: errorMessage(err, 'Discard failed') }, { status: 500 })
  }
}
